import type { FastifyInstance, FastifyReply, FastifyRequest } from "fastify";
import { DashboardError, type DashboardRepository, type NewAccount, type TransactionQuery } from "./dashboard.js";

function requireUserId(request: FastifyRequest, reply: FastifyReply): string | null {
  const value = request.headers["x-user-id"];
  const userId = typeof value === "string" && value.trim() ? value.trim() : null;
  if (!userId) reply.code(401).send({ error: "x-user-id is required" });
  return userId;
}

function sendError(reply: FastifyReply, error: unknown) {
  if (error instanceof DashboardError) return reply.code(error.statusCode).send({ error: error.message });
  return reply.code(400).send({ error: error instanceof Error ? error.message : "invalid request" });
}

export function registerDashboardRoutes(app: FastifyInstance, dashboard: DashboardRepository) {
  app.get("/api/me", async (request, reply) => {
    const value = request.headers["x-user-id"];
    const preferred = typeof value === "string" && value.trim() ? value.trim() : undefined;
    try { return await dashboard.ensureUser(preferred); }
    catch (error) { return sendError(reply, error); }
  });

  app.get("/api/accounts", async (request, reply) => {
    const userId = requireUserId(request, reply); if (!userId) return;
    try { return { accounts: await dashboard.listAccounts(userId) }; }
    catch (error) { return sendError(reply, error); }
  });

  app.post<{ Body: Partial<NewAccount> }>("/api/accounts", async (request, reply) => {
    const userId = requireUserId(request, reply); if (!userId) return;
    const { name, institutionName, accountType } = request.body ?? {};
    try {
      const account = await dashboard.createAccount(userId, { name: name ?? "", institutionName: institutionName ?? "", accountType: accountType ?? "checking" });
      return reply.code(201).send(account);
    } catch (error) { return sendError(reply, error); }
  });

  app.get("/api/categories", async (request, reply) => {
    const userId = requireUserId(request, reply); if (!userId) return;
    try { return { categories: await dashboard.listCategories(userId) }; }
    catch (error) { return sendError(reply, error); }
  });

  app.get<{ Querystring: Record<string, string | undefined> }>("/api/transactions", async (request, reply) => {
    const userId = requireUserId(request, reply); if (!userId) return;
    const { accountId, categoryId, from, to, needsReview, limit, cursor } = request.query;
    const query: TransactionQuery = {
      accountId: accountId || undefined,
      categoryId: categoryId || undefined,
      from: from || undefined,
      to: to || undefined,
      needsReview: needsReview === undefined || needsReview === "" ? undefined : needsReview === "true",
      limit: limit ? Number(limit) : undefined,
      cursor: cursor || undefined,
    };
    if (query.limit !== undefined && !Number.isInteger(query.limit)) return reply.code(400).send({ error: "limit must be an integer" });
    try { return await dashboard.listTransactions(userId, query); }
    catch (error) { return sendError(reply, error); }
  });

  app.patch<{ Params: { id: string }; Body: { categoryId?: string } }>("/api/transactions/:id", async (request, reply) => {
    const userId = requireUserId(request, reply); if (!userId) return;
    const categoryId = request.body?.categoryId;
    if (!categoryId) return reply.code(400).send({ error: "categoryId is required" });
    try { return await dashboard.correctTransaction(userId, request.params.id, categoryId); }
    catch (error) { return sendError(reply, error); }
  });

  app.post<{ Params: { id: string } }>("/api/transactions/:id/confirm", async (request, reply) => {
    const userId = requireUserId(request, reply); if (!userId) return;
    try { return await dashboard.confirmTransaction(userId, request.params.id); }
    catch (error) { return sendError(reply, error); }
  });

  app.get("/api/subscriptions", async (request, reply) => {
    const userId = requireUserId(request, reply); if (!userId) return;
    try { return { subscriptions: await dashboard.listSubscriptions(userId) }; }
    catch (error) { return sendError(reply, error); }
  });

  app.get<{ Params: { id: string } }>("/api/statements/:id", async (request, reply) => {
    const userId = requireUserId(request, reply); if (!userId) return;
    try {
      const statement = await dashboard.getStatement(userId, request.params.id);
      return statement ?? reply.code(404).send({ error: "statement not found" });
    } catch (error) { return sendError(reply, error); }
  });
}
