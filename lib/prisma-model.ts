/* eslint-disable @typescript-eslint/no-explicit-any */

import { getDb } from "@/lib/db";
import { Types } from "@/lib/id";

type AnyRecord = Record<string, any>;
type ModelName =
  | "user"
  | "resume"
  | "jobDescription"
  | "generation"
  | "designTemplate"
  | "article"
  | "backgroundTask"
  | "backgroundTaskLease";

type ModelConfig = {
  model: ModelName;
  mapField?: (field: string) => string;
  toDb?: (value: AnyRecord) => AnyRecord;
  fromDb?: (value: AnyRecord) => AnyRecord;
};

function stringifyId(value: unknown) {
  return value instanceof Types.ObjectId ? value.toString() : value;
}

function isPlainObject(value: unknown): value is AnyRecord {
  return Boolean(value) && typeof value === "object" && !Array.isArray(value) && !(value instanceof Date) && !(value instanceof Uint8Array) && !Buffer.isBuffer(value);
}

function setNested(target: AnyRecord, path: string, value: unknown) {
  const parts = path.split(".");
  let cursor = target;

  for (const part of parts.slice(0, -1)) {
    cursor[part] = isPlainObject(cursor[part]) ? cursor[part] : {};
    cursor = cursor[part];
  }

  cursor[parts[parts.length - 1]] = value;
}

function normalizeIds(value: unknown): unknown {
  if (value instanceof Types.ObjectId) {
    return value.toString();
  }

  if (Array.isArray(value)) {
    return value.map((entry) => normalizeIds(entry));
  }

  if (isPlainObject(value)) {
    return Object.fromEntries(
      Object.entries(value).map(([key, entry]) => [key, normalizeIds(entry)]),
    );
  }

  return value;
}

function pickSelected(row: AnyRecord, selectFields: string | null) {
  if (!selectFields) {
    return row;
  }

  const rawFields = selectFields
    .split(/\s+/)
    .map((field) => field.trim().replace(/^\+/, ""))
    .filter(Boolean)
    .filter((field) => !field.startsWith("-"));

  const onlyInclusiveHiddenFields = selectFields
    .split(/\s+/)
    .map((field) => field.trim())
    .filter(Boolean)
    .every((field) => field.startsWith("+"));

  if (onlyInclusiveHiddenFields) {
    return row;
  }

  const fields = rawFields;

  if (!fields.length) {
    return row;
  }

  const selected: AnyRecord = { id: row.id, _id: row._id };
  for (const field of fields) {
    if (field in row) {
      selected[field] = row[field];
    }
  }
  return selected;
}

function toDbOperator(operator: string, value: unknown) {
  switch (operator) {
    case "$in":
      return { in: normalizeIds(value) };
    case "$nin":
      return { notIn: normalizeIds(value) };
    case "$ne":
      return { not: normalizeIds(value) };
    case "$lte":
      return { lte: normalizeIds(value) };
    case "$lt":
      return { lt: normalizeIds(value) };
    case "$gte":
      return { gte: normalizeIds(value) };
    case "$gt":
      return { gt: normalizeIds(value) };
    case "$exists":
      return value ? { not: null } : null;
    default:
      return undefined;
  }
}

function convertWhere(filter: AnyRecord | null | undefined, config: ModelConfig): AnyRecord {
  if (!filter) {
    return {};
  }

  const where: AnyRecord = {};

  for (const [rawKey, rawValue] of Object.entries(filter)) {
    if (rawKey === "$or") {
      where.OR = Array.isArray(rawValue)
        ? rawValue.map((entry) => convertWhere(entry, config))
        : [];
      continue;
    }

    if (rawKey === "$and") {
      where.AND = Array.isArray(rawValue)
        ? rawValue.map((entry) => convertWhere(entry, config))
        : [];
      continue;
    }

    const key = config.mapField?.(rawKey) ?? (rawKey === "_id" ? "id" : rawKey);

    if (isPlainObject(rawValue)) {
      const operatorEntries = Object.entries(rawValue)
        .map(([operator, value]) => [operator, toDbOperator(operator, value)] as const)
        .filter(([, value]) => value !== undefined);

      if (operatorEntries.length) {
        where[key] = Object.assign({}, ...operatorEntries.map(([, value]) => value));
        continue;
      }
    }

    where[key] = normalizeIds(rawValue);
  }

  return where;
}

function convertOrderBy(sort: AnyRecord | null | undefined, config: ModelConfig) {
  if (!sort) {
    return undefined;
  }

  return Object.entries(sort).map(([field, direction]) => ({
    [config.mapField?.(field) ?? (field === "_id" ? "id" : field)]:
      Number(direction) < 0 ? "desc" : "asc",
  }));
}

function normalizeUpdate(update: AnyRecord, config: ModelConfig) {
  const data: AnyRecord = {};
  const pushUpdates: AnyRecord = {};
  const nestedUpdates: Array<[string, unknown]> = [];
  const entries = update.$set && isPlainObject(update.$set)
    ? Object.entries(update.$set)
    : Object.entries(update).filter(([key]) => !key.startsWith("$"));

  for (const [rawKey, value] of entries) {
    const key = config.mapField?.(rawKey) ?? (rawKey === "_id" ? "id" : rawKey);
    if (key.includes(".")) {
      nestedUpdates.push([key, normalizeIds(value)]);
    } else {
      data[key] = normalizeIds(value);
    }
  }

  if (update.$push && isPlainObject(update.$push)) {
    for (const [rawKey, value] of Object.entries(update.$push)) {
      const key = config.mapField?.(rawKey) ?? rawKey;
      pushUpdates[key] = normalizeIds(value);
    }
  }

  const transformed = config.toDb ? config.toDb(data) : data;

  return {
    data: transformed,
    pushUpdates,
    nestedUpdates,
  };
}

function createDataFromFilter(filter: AnyRecord | null | undefined) {
  const data: AnyRecord = {};

  if (!filter) {
    return data;
  }

  for (const [key, value] of Object.entries(filter)) {
    if (key.startsWith("$") || isPlainObject(value)) {
      continue;
    }
    data[key] = value;
  }

  return data;
}

function createDocument(row: AnyRecord, config: ModelConfig) {
  const target = { ...row };

  Object.defineProperty(target, "save", {
    enumerable: false,
    value: async () => {
      const id = target._id?.toString() ?? target.id?.toString();
      const { data } = normalizeUpdate(target, config);
      const updated = await delegate(config).update({
        where: { id },
        data,
      });
      Object.assign(target, fromDb(updated, config));
      return target;
    },
  });

  Object.defineProperty(target, "deleteOne", {
    enumerable: false,
    value: async () => {
      const id = target._id?.toString() ?? target.id?.toString();
      return delegate(config).delete({ where: { id } });
    },
  });

  return target;
}

function fromDb(row: AnyRecord | null, config: ModelConfig): AnyRecord | null {
  if (!row) {
    return null;
  }

  const transformed = config.fromDb ? config.fromDb(row) : row;
  return {
    ...transformed,
    _id: transformed.id,
  };
}

function delegate(config: ModelConfig): any {
  return (getDb() as any)[config.model];
}

class Query<T> implements PromiseLike<T> {
  private selectFields: string | null = null;
  private sortSpec: AnyRecord | null = null;
  private takeLimit: number | null = null;

  constructor(
    private readonly config: ModelConfig,
    private readonly action: "findMany" | "findFirst" | "findUnique" | "count" | "updateFirst" | "deleteFirst" | "exists",
    private readonly args: AnyRecord = {},
    private readonly asLean = false,
  ) {}

  select(fields: string) {
    this.selectFields = fields;
    return this;
  }

  sort(sort: AnyRecord) {
    this.sortSpec = sort;
    return this;
  }

  limit(limit: number) {
    this.takeLimit = limit;
    return this;
  }

  lean() {
    return new Query<T>(this.config, this.action, this.args, true).withState(
      this.selectFields,
      this.sortSpec,
      this.takeLimit,
    );
  }

  catch<TResult = never>(
    onrejected?: ((reason: any) => TResult | PromiseLike<TResult>) | null,
  ) {
    return this.exec().catch(onrejected);
  }

  finally(onfinally?: (() => void) | null) {
    return this.exec().finally(onfinally);
  }

  then<TResult1 = T, TResult2 = never>(
    onfulfilled?: ((value: T) => TResult1 | PromiseLike<TResult1>) | null,
    onrejected?: ((reason: any) => TResult2 | PromiseLike<TResult2>) | null,
  ) {
    return this.exec().then(onfulfilled, onrejected);
  }

  private withState(
    selectFields: string | null,
    sortSpec: AnyRecord | null,
    takeLimit: number | null,
  ) {
    this.selectFields = selectFields;
    this.sortSpec = sortSpec;
    this.takeLimit = takeLimit;
    return this;
  }

  private async applyNestedUpdates(id: string, nestedUpdates: Array<[string, unknown]>) {
    if (!nestedUpdates.length) {
      return;
    }

    const current = fromDb(await delegate(this.config).findUnique({ where: { id } }), this.config);
    if (!current) {
      return;
    }

    const update: AnyRecord = {};
    for (const [path, value] of nestedUpdates) {
      setNested(update, path, value);
    }

    const merged = PrismaModel.mergeDeep(current, update);
    const { data } = normalizeUpdate(merged, this.config);
    await delegate(this.config).update({ where: { id }, data });
  }

  private async applyPushUpdates(id: string, pushUpdates: AnyRecord) {
    if (!Object.keys(pushUpdates).length) {
      return;
    }

    const current = fromDb(await delegate(this.config).findUnique({ where: { id } }), this.config);
    if (!current) {
      return;
    }

    const update: AnyRecord = {};
    for (const [field, value] of Object.entries(pushUpdates)) {
      update[field] = [...(Array.isArray(current[field]) ? current[field] : []), value];
    }

    const { data } = normalizeUpdate(update, this.config);
    await delegate(this.config).update({ where: { id }, data });
  }

  private async exec(): Promise<T> {
    const model = delegate(this.config);
    const where = convertWhere(this.args.where, this.config);
    const select = undefined;
    const orderBy = convertOrderBy(this.sortSpec ?? this.args.orderBy, this.config);

    if (this.action === "count") {
      return model.count({ where }) as Promise<T>;
    }

    if (this.action === "exists") {
      const row = await model.findFirst({ where, select: { id: true } });
      return row as T;
    }

    if (this.action === "updateFirst") {
      const row = await model.findFirst({ where, select: { id: true } });
      if (!row) {
        if (this.args.upsert) {
          const { data } = normalizeUpdate(
            { ...createDataFromFilter(this.args.create), ...this.args.update },
            this.config,
          );
          const created = await model.create({ data });
          return this.finishRow(created) as T;
        }
        return null as T;
      }

      const { data, pushUpdates, nestedUpdates } = normalizeUpdate(this.args.update, this.config);
      if (Object.keys(data).length) {
        await model.update({ where: { id: row.id }, data });
      }
      await this.applyPushUpdates(row.id, pushUpdates);
      await this.applyNestedUpdates(row.id, nestedUpdates);
      const updated = await model.findUnique({ where: { id: row.id }, select });
      return this.finishRow(updated) as T;
    }

    if (this.action === "deleteFirst") {
      const row = await model.findFirst({ where, select: { id: true } });
      if (!row) {
        return null as T;
      }
      const deleted = await model.delete({ where: { id: row.id } });
      return this.finishRow(deleted) as T;
    }

    if (this.action === "findMany") {
      const rows = await model.findMany({
        where,
        orderBy,
        take: this.takeLimit ?? undefined,
        select,
      });
      return rows.map((row: AnyRecord) => this.finishRow(row)) as T;
    }

    const method = this.action === "findUnique" ? "findUnique" : "findFirst";
    const row = await model[method]({
      where: this.action === "findUnique" ? { id: stringifyId(this.args.id) } : where,
      orderBy,
      select,
    });
    return this.finishRow(row) as T;
  }

  private finishRow(row: AnyRecord | null) {
    const transformed = fromDb(row, this.config);
    const selected = transformed ? pickSelected(transformed, this.selectFields) : null;
    return selected && !this.asLean ? createDocument(selected, this.config) : selected;
  }
}

export class PrismaModel {
  constructor(private readonly config: ModelConfig) {}

  static mergeDeep(target: AnyRecord, source: AnyRecord): AnyRecord {
    const output = { ...target };
    for (const [key, value] of Object.entries(source)) {
      output[key] =
        isPlainObject(value) && isPlainObject(output[key])
          ? PrismaModel.mergeDeep(output[key], value)
          : value;
    }
    return output;
  }

  find(filter: AnyRecord = {}): Query<any[]> {
    return new Query<any[]>(this.config, "findMany", { where: filter }, true);
  }

  findOne(filter: AnyRecord = {}): Query<any | null> {
    return new Query<any | null>(this.config, "findFirst", { where: filter });
  }

  findById(id: unknown): Query<any | null> {
    return new Query<any | null>(this.config, "findUnique", { id });
  }

  countDocuments(filter: AnyRecord = {}): Query<number> {
    return new Query<number>(this.config, "count", { where: filter }, true);
  }

  exists(filter: AnyRecord = {}): Query<any | null> {
    return new Query<any | null>(this.config, "exists", { where: filter }, true);
  }

  async create(data: AnyRecord): Promise<any> {
    const transformed = this.config.toDb ? this.config.toDb(normalizeIds(data) as AnyRecord) : normalizeIds(data);
    const row = await delegate(this.config).create({ data: transformed });
    return createDocument(fromDb(row, this.config)!, this.config);
  }

  findOneAndUpdate(
    filter: AnyRecord,
    update: AnyRecord,
    options: AnyRecord = {},
  ): Query<any | null> {
    return new Query<any | null>(this.config, "updateFirst", {
      where: filter,
      update,
      upsert: Boolean(options.upsert),
      create: filter,
    });
  }

  findByIdAndUpdate(
    id: unknown,
    update: AnyRecord,
    options: AnyRecord = {},
  ): Query<any | null> {
    return this.findOneAndUpdate({ _id: stringifyId(id) }, update, options);
  }

  findOneAndDelete(filter: AnyRecord): Query<any | null> {
    return new Query<any | null>(this.config, "deleteFirst", { where: filter }, true);
  }

  async deleteMany(filter: AnyRecord = {}) {
    return delegate(this.config).deleteMany({
      where: convertWhere(filter, this.config),
    });
  }

  async deleteOne(filter: AnyRecord = {}) {
    const row = await delegate(this.config).findFirst({
      where: convertWhere(filter, this.config),
      select: { id: true },
    });

    if (!row) {
      return { deletedCount: 0 };
    }

    await delegate(this.config).delete({ where: { id: row.id } });
    return { deletedCount: 1 };
  }

  async updateMany(filter: AnyRecord, update: AnyRecord) {
    const rows = await delegate(this.config).findMany({
      where: convertWhere(filter, this.config),
      select: { id: true },
    });

    for (const row of rows) {
      await this.findByIdAndUpdate(row.id, update);
    }

    return { modifiedCount: rows.length, count: rows.length };
  }
}

function mapUserField(field: string) {
  const fieldMap: Record<string, string> = {
    _id: "id",
    "membership.tier": "membershipTier",
    "membership.status": "membershipStatus",
    "membership.startedAt": "membershipStartedAt",
    "membership.expiresAt": "membershipExpiresAt",
    "membership.requestedTier": "membershipRequestedTier",
    "membership.requestStatus": "membershipRequestStatus",
    "membership.requestDate": "membershipRequestDate",
    "membership.requestReason": "membershipRequestReason",
    "settings.preferredAI": "preferredAI",
    "settings.preferredGeminiRouterIndex": "preferredGeminiRouterIndex",
    "settings.preferredHuggingFaceRouterIndex": "preferredHuggingFaceRouterIndex",
  };

  return fieldMap[field] ?? field;
}

function userToDb(value: AnyRecord) {
  const data = { ...value };

  if (isPlainObject(data.membership)) {
    data.membershipTier = data.membership.tier ?? "free";
    data.membershipStatus = data.membership.status ?? "active";
    data.membershipStartedAt = data.membership.startedAt ?? new Date();
    data.membershipExpiresAt = data.membership.expiresAt ?? null;
    data.membershipRequestedTier = data.membership.requestedTier ?? null;
    data.membershipRequestStatus = data.membership.requestStatus ?? "none";
    data.membershipRequestDate = data.membership.requestDate ?? null;
    data.membershipRequestReason = data.membership.requestReason ?? "";
    delete data.membership;
  }

  if (isPlainObject(data.settings)) {
    data.preferredAI = data.settings.preferredAI ?? data.preferredAI;
    data.preferredGeminiRouterIndex =
      data.settings.preferredGeminiRouterIndex ?? data.preferredGeminiRouterIndex;
    data.preferredHuggingFaceRouterIndex =
      data.settings.preferredHuggingFaceRouterIndex ?? data.preferredHuggingFaceRouterIndex;
    delete data.settings;
  }

  delete data._id;
  delete data.id;
  return data;
}

function userFromDb(value: AnyRecord) {
  return {
    ...value,
    membership: {
      tier: value.membershipTier ?? "free",
      status: value.membershipStatus ?? "active",
      startedAt: value.membershipStartedAt ?? null,
      expiresAt: value.membershipExpiresAt ?? null,
      requestedTier: value.membershipRequestedTier ?? null,
      requestStatus: value.membershipRequestStatus ?? "none",
      requestDate: value.membershipRequestDate ?? null,
      requestReason: value.membershipRequestReason ?? "",
    },
    settings: {
      preferredAI: value.preferredAI ?? "openai",
      preferredGeminiRouterIndex: value.preferredGeminiRouterIndex ?? 1,
      preferredHuggingFaceRouterIndex: value.preferredHuggingFaceRouterIndex ?? 1,
    },
  };
}

function mapTaskField(field: string) {
  const fieldMap: Record<string, string> = {
    _id: "id",
    "sourceFile.buffer": "sourceFileBuffer",
    "sourceFile.mimeType": "sourceFileMimeType",
    "sourceFile.size": "sourceFileSize",
  };

  return fieldMap[field] ?? field;
}

function taskToDb(value: AnyRecord) {
  const data = { ...value };
  if (isPlainObject(data.sourceFile)) {
    data.sourceFileBuffer = data.sourceFile.buffer ?? null;
    data.sourceFileMimeType = data.sourceFile.mimeType ?? "";
    data.sourceFileSize = data.sourceFile.size ?? 0;
    delete data.sourceFile;
  }
  delete data._id;
  delete data.id;
  return data;
}

function taskFromDb(value: AnyRecord) {
  const buffer = value.sourceFileBuffer
    ? Buffer.from(value.sourceFileBuffer)
    : undefined;

  return {
    ...value,
    sourceFile: buffer
      ? {
          buffer,
          mimeType: value.sourceFileMimeType ?? "",
          size: value.sourceFileSize ?? buffer.length,
        }
      : undefined,
  };
}

function identityToDb(value: AnyRecord) {
  const data = { ...value };
  delete data._id;
  delete data.id;
  return data;
}

export function createPrismaModel(config: ModelConfig): PrismaModel {
  return new PrismaModel({
    toDb: identityToDb,
    ...config,
  });
}

export const modelConfigs = {
  user: { model: "user", mapField: mapUserField, toDb: userToDb, fromDb: userFromDb },
  backgroundTask: {
    model: "backgroundTask",
    mapField: mapTaskField,
    toDb: taskToDb,
    fromDb: taskFromDb,
  },
} satisfies Record<string, Partial<ModelConfig>>;
