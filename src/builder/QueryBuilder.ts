import { Document, FilterQuery, Query } from 'mongoose';

const DEFAULT_LIMIT = 10;
const MAX_LIMIT = 100;
const MAX_PAGE = 10_000;
const MAX_SEARCH_LENGTH = 100;

const positiveInteger = (value: unknown, fallback: number, maximum: number) => {
  const parsed =
    typeof value === 'string' || typeof value === 'number'
      ? Number(value)
      : Number.NaN;
  if (!Number.isSafeInteger(parsed) || parsed < 1) return fallback;
  return Math.min(parsed, maximum);
};

const escapeRegex = (value: string) =>
  value.replace(/[.*+?^${}()|[\]\\]/g, '\\$&');

const isSafeFilterValue = (
  value: unknown,
): value is string | number | boolean | null =>
  value === null ||
  typeof value === 'string' ||
  typeof value === 'number' ||
  typeof value === 'boolean';

class QueryBuilder<T extends Document> {
  public modelQuery: Query<T[], T>;
  public query: Record<string, unknown>;

  constructor(modelQuery: Query<T[], T>, query: Record<string, unknown>) {
    this.modelQuery = modelQuery;
    this.query = query;
  }

  search(searchableFields: readonly string[]) {
    const rawSearchTerm = this.query.searchTerm;
    if (typeof rawSearchTerm === 'string' && rawSearchTerm.trim()) {
      const searchTerm = escapeRegex(
        rawSearchTerm.trim().slice(0, MAX_SEARCH_LENGTH),
      );
      this.modelQuery = this.modelQuery.find({
        $or: searchableFields.map(field => ({
          [field]: { $regex: searchTerm, $options: 'i' },
        })) as FilterQuery<T>[],
      });
    }
    return this;
  }

  filter(filterableFields: readonly string[] = []) {
    const filters: Record<string, string | number | boolean | null> = {};
    for (const field of filterableFields) {
      const value = this.query[field];
      if (value !== undefined && isSafeFilterValue(value)) {
        filters[field] = value;
      }
    }

    if (Object.keys(filters).length) {
      // Applying user filters inside $and prevents a duplicate key from
      // overwriting authorization scope on the original Mongoose query.
      this.modelQuery = this.modelQuery.find({
        $and: [filters as FilterQuery<T>],
      });
    }
    return this;
  }

  paginate() {
    const page = positiveInteger(this.query.page, 1, MAX_PAGE);
    const limit = positiveInteger(this.query.limit, DEFAULT_LIMIT, MAX_LIMIT);
    const skip = (page - 1) * limit;

    this.modelQuery = this.modelQuery.skip(skip).limit(limit);
    return this;
  }

  sort(sortableFields: readonly string[] = ['createdAt']) {
    const requested = this.query.sortBy;
    const sortBy =
      typeof requested === 'string' && sortableFields.includes(requested)
        ? requested
        : sortableFields.includes('createdAt')
          ? 'createdAt'
          : sortableFields[0];
    if (sortBy) {
      const sortOrder = this.query.sortOrder === 'asc' ? 1 : -1;
      this.modelQuery = this.modelQuery.sort({ [sortBy]: sortOrder });
    }
    return this;
  }

  async pagination() {
    const total = await this.modelQuery.model.countDocuments(
      this.modelQuery.getFilter(),
    );
    const page = positiveInteger(this.query.page, 1, MAX_PAGE);
    const limit = positiveInteger(this.query.limit, DEFAULT_LIMIT, MAX_LIMIT);

    return {
      page,
      limit,
      totalPage: Math.ceil(total / limit),
      total,
    };
  }
}

export default QueryBuilder;
