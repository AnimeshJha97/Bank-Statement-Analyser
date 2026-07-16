import { randomBytes } from "node:crypto";
import { and, eq, gt } from "drizzle-orm";
import { apiKeys, decryptSecret, encryptSecret, hashPassword, hashSessionToken, sessions, users, verifyPassword, type createDatabase } from "@statement/core";
import type { FastifyInstance, FastifyRequest } from "fastify";

type Database = ReturnType<typeof createDatabase>["db"];
export type AuthUser = { userId: string; email: string };

function cookie(request: FastifyRequest, name: string): string | undefined {
  const header = request.headers.cookie;
  return header?.split(";").map((value) => value.trim()).find((value) => value.startsWith(`${name}=`))?.slice(name.length + 1);
}

export class AuthService {
  constructor(private readonly db: Database, private readonly encryptionKey: Buffer) {}

  async authenticate(request: FastifyRequest): Promise<AuthUser | null> {
    const token = cookie(request, "statement_session");
    if (!token) return null;
    const [row] = await this.db.select({ userId: users.id, email: users.email }).from(sessions)
      .innerJoin(users, eq(sessions.userId, users.id))
      .where(and(eq(sessions.tokenHash, hashSessionToken(token)), gt(sessions.expiresAt, new Date()))).limit(1);
    return row ?? null;
  }

  async signup(emailInput: string, password: string): Promise<{ user: AuthUser; token: string }> {
    const email = emailInput.trim().toLowerCase();
    if (!/^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(email)) throw new Error("Enter a valid email address");
    const passwordHash = await hashPassword(password);
    try {
      const [created] = await this.db.insert(users).values({ email, passwordHash }).returning({ userId: users.id, email: users.email });
      if (!created) throw new Error("Failed to create account");
      return { user: created, token: await this.createSession(created.userId) };
    } catch (error) {
      if (String(error).includes("users_email_unique")) throw new Error("An account with that email already exists");
      throw error;
    }
  }

  async login(emailInput: string, password: string): Promise<{ user: AuthUser; token: string } | null> {
    const email = emailInput.trim().toLowerCase();
    const [row] = await this.db.select({ userId: users.id, email: users.email, passwordHash: users.passwordHash }).from(users).where(eq(users.email, email)).limit(1);
    if (!row?.passwordHash || !(await verifyPassword(password, row.passwordHash))) return null;
    return { user: { userId: row.userId, email: row.email }, token: await this.createSession(row.userId) };
  }

  async logout(request: FastifyRequest): Promise<void> {
    const token = cookie(request, "statement_session");
    if (token) await this.db.delete(sessions).where(eq(sessions.tokenHash, hashSessionToken(token)));
  }

  async keyStatus(userId: string) {
    const [row] = await this.db.select({ createdAt: apiKeys.createdAt, updatedAt: apiKeys.updatedAt }).from(apiKeys)
      .where(and(eq(apiKeys.userId, userId), eq(apiKeys.provider, "openai"))).limit(1);
    return { configured: Boolean(row), createdAt: row?.createdAt.toISOString() ?? null, updatedAt: row?.updatedAt.toISOString() ?? null };
  }

  async saveOpenAIKey(userId: string, value: string): Promise<void> {
    const key = value.trim();
    if (!/^sk-[A-Za-z0-9_-]{20,}$/.test(key)) throw new Error("Enter a valid OpenAI API key");
    const encryptedKey = encryptSecret(key, this.encryptionKey);
    await this.db.insert(apiKeys).values({ userId, provider: "openai", encryptedKey }).onConflictDoUpdate({
      target: [apiKeys.userId, apiKeys.provider], set: { encryptedKey, updatedAt: new Date() },
    });
  }

  async getOpenAIKey(userId: string): Promise<string | undefined> {
    const [row] = await this.db.select({ encryptedKey: apiKeys.encryptedKey }).from(apiKeys)
      .where(and(eq(apiKeys.userId, userId), eq(apiKeys.provider, "openai"))).limit(1);
    return row ? decryptSecret(row.encryptedKey, this.encryptionKey) : undefined;
  }

  private async createSession(userId: string): Promise<string> {
    const token = randomBytes(32).toString("base64url");
    await this.db.insert(sessions).values({ userId, tokenHash: hashSessionToken(token), expiresAt: new Date(Date.now() + 30 * 86400_000) });
    return token;
  }
}

const sessionCookie = (token: string, secure: boolean) => `statement_session=${token}; Path=/; HttpOnly; SameSite=Strict; Max-Age=2592000${secure ? "; Secure" : ""}`;

export function registerAuthRoutes(app: FastifyInstance, auth: AuthService) {
  app.post<{ Body: { email?: string; password?: string } }>("/api/auth/signup", async (request, reply) => {
    try {
      const result = await auth.signup(request.body?.email ?? "", request.body?.password ?? "");
      reply.header("set-cookie", sessionCookie(result.token, request.protocol === "https"));
      return reply.code(201).send(result.user);
    } catch (error) { return reply.code(400).send({ error: error instanceof Error ? error.message : "Signup failed" }); }
  });
  app.post<{ Body: { email?: string; password?: string } }>("/api/auth/login", async (request, reply) => {
    const result = await auth.login(request.body?.email ?? "", request.body?.password ?? "");
    if (!result) return reply.code(401).send({ error: "Invalid email or password" });
    reply.header("set-cookie", sessionCookie(result.token, request.protocol === "https"));
    return result.user;
  });
  app.post("/api/auth/logout", async (request, reply) => {
    await auth.logout(request);
    reply.header("set-cookie", "statement_session=; Path=/; HttpOnly; SameSite=Strict; Max-Age=0");
    return reply.code(204).send();
  });
  app.get("/api/me", async (request, reply) => (await auth.authenticate(request)) ?? reply.code(401).send({ error: "Authentication required" }));
  app.get("/api/settings/openai", async (request, reply) => {
    const user = await auth.authenticate(request); if (!user) return reply.code(401).send({ error: "Authentication required" });
    return auth.keyStatus(user.userId);
  });
  app.put<{ Body: { apiKey?: string } }>("/api/settings/openai", async (request, reply) => {
    const user = await auth.authenticate(request); if (!user) return reply.code(401).send({ error: "Authentication required" });
    try { await auth.saveOpenAIKey(user.userId, request.body?.apiKey ?? ""); return auth.keyStatus(user.userId); }
    catch (error) { return reply.code(400).send({ error: error instanceof Error ? error.message : "Could not save key" }); }
  });
}
