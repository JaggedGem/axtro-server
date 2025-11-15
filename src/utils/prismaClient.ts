import { PrismaClient, Prisma } from "@prisma/client";

// Singleton instance for connection pooling and lifecycle management
let prismaInstance: PrismaClient | null = null;

/**
 * Configuration options for Prisma Client initialization
 */
interface PrismaConfig {
    log?: Prisma.LogLevel[];
    errorFormat?: 'pretty' | 'colorless' | 'minimal';
}

/**
 * Gets or creates the singleton Prisma Client instance
 * This ensures proper connection pooling and prevents multiple client instances
 * 
 * @param {PrismaConfig} [config] - Optional configuration for the Prisma Client
 * @returns {PrismaClient} The Prisma Client instance
 */
const getPrismaClient = (config?: PrismaConfig): PrismaClient => {
    if (!prismaInstance) {
        prismaInstance = new PrismaClient({
            log: config?.log || ['error', 'warn'],
            errorFormat: config?.errorFormat || 'colorless',
        });
    }
    return prismaInstance;
};

/**
 * Disconnects the Prisma Client and cleans up resources
 * Should be called on application shutdown
 * 
 * @returns {Promise<void>}
 */
const disconnectPrismaClient = async (): Promise<void> => {
    if (prismaInstance) {
        await prismaInstance.$disconnect();
        prismaInstance = null;
    }
};

// Graceful shutdown handlers
process.on('beforeExit', async () => {
    await disconnectPrismaClient();
});

process.on('SIGINT', async () => {
    await disconnectPrismaClient();
    process.exit(0);
});

process.on('SIGTERM', async () => {
    await disconnectPrismaClient();
    process.exit(0);
});

const prisma = getPrismaClient();

// Type-safe model name validation
type ModelName = Prisma.ModelName;

const VALID_MODELS: readonly ModelName[] = [
    "User",
    "Folder",
    "File",
    "FileVersion",
    "Share"
] as const;

/**
 * Validates if a given table name is a valid Prisma model
 * @param tableName - The table name to validate
 * @returns True if valid, false otherwise
 */
const isValidModel = (tableName: string): tableName is ModelName => {
    return VALID_MODELS.includes(tableName as ModelName);
};

/**
 * Type-safe delegate getter with proper validation
 * @param tableName - The model name
 * @returns The Prisma delegate for the model
 * @throws Error if model is invalid
 */
const getDelegate = (tableName: string) => {
    if (!isValidModel(tableName)) {
        throw new Error(`Invalid model name: ${tableName}. Valid models are: ${VALID_MODELS.join(", ")}`);
    }
    
    return (prisma as any)[tableName.toLowerCase()];
};

/**
 * Inserts one or more records into a specified Prisma table.
 * 
 * @template T - The type of data being inserted
 * @param {ModelName} tableName - The name of the Prisma model/table to insert into
 * @param {T | T[]} data - The record data to insert. Can be a single object or an array of objects
 * @param {boolean} [skipDuplicates=true] - When inserting multiple records, skip duplicates instead of throwing an error
 * @returns {Promise} A promise that resolves to the created record(s)
 * @throws {Error} If the specified table does not exist in the Prisma Client
 * @throws {Error} If there is an error during the insert operation
 * 
 * @example
 * // Insert a single record
 * await insertRecord('User', { name: 'John', email: 'john@example.com', password: 'hash' });
 * 
 * @example
 * // Insert multiple records
 * await insertRecord('User', [
 *   { name: 'John', email: 'john@example.com', password: 'hash1' },
 *   { name: 'Jane', email: 'jane@example.com', password: 'hash2' }
 * ]);
 */
const insertRecord = <T extends Record<string, any>>(
    tableName: ModelName, 
    data: T | T[], 
    skipDuplicates: boolean = true
) => {
    const delegate = getDelegate(tableName);

    if (Array.isArray(data)) {
        return delegate.createMany({ 
            data, 
            skipDuplicates 
        });
    } else {
        return delegate.create({ 
            data 
        });
    }
}

/**
 * Finds a single unique record in a specified Prisma table.
 * 
 * @template T - The type of the where clause
 * @template S - The type of the select clause
 * @param {ModelName} tableName - The name of the Prisma model/table to query
 * @param {T} query - The where clause to identify the unique record
 * @param {S} [select] - Optional object specifying which fields to return
 * @returns {Promise} A promise that resolves to the found record or null if not found
 * @throws {Error} If the specified table does not exist in the Prisma Client
 * 
 * @example
 * // Find a user by ID
 * await findRecord('User', { id: '123' });
 * 
 * @example
 * // Find a user with selected fields
 * await findRecord('User', { id: '123' }, { name: true, email: true });
 */
const findRecord = <
    T extends Record<string, any>,
    S extends Record<string, boolean> | undefined = undefined
>(
    tableName: ModelName, 
    query: T, 
    select?: S
) => {
    const delegate = getDelegate(tableName);

    return delegate.findUnique({
        where: query,
        ...(select && { select })
    });
}

/**
 * Options for finding multiple records
 */
interface FindManyOptions<T = any, S = any> {
    where?: T;
    select?: S;
    orderBy?: Record<string, 'asc' | 'desc'>;
    skip?: number;
    take?: number;
    page?: number;
    perPage?: number;
}

/**
 * Finds multiple records in a specified Prisma table with optional pagination and filtering.
 * 
 * @template T - The type of the where clause
 * @template S - The type of the select clause
 * @param {ModelName} tableName - The name of the Prisma model/table to query
 * @param {FindManyOptions<T, S>} [options] - Query options including where, select, pagination, and ordering
 * @returns {Promise} A promise that resolves to an array of records
 * @throws {Error} If the specified table does not exist in the Prisma Client
 * 
 * @example
 * // Find all users
 * await findManyRecords('User');
 * 
 * @example
 * // Find users with filtering
 * await findManyRecords('User', { where: { email: { contains: '@example.com' } } });
 * 
 * @example
 * // Find users with pagination
 * await findManyRecords('User', { 
 *   where: { createdAt: { gte: new Date('2025-01-01') } },
 *   page: 1, 
 *   perPage: 10, 
 *   orderBy: { createdAt: 'desc' }
 * });
 */
const findManyRecords = <
    T extends Record<string, any> = any,
    S extends Record<string, boolean> | undefined = undefined
>(
    tableName: ModelName, 
    options?: FindManyOptions<T, S>
) => {
    const delegate = getDelegate(tableName);

    const { where, select, orderBy, skip, take, page, perPage } = options || {};

    // Calculate pagination
    const calculatedSkip = page && perPage ? (page - 1) * perPage : skip;
    const calculatedTake = perPage || take;

    return delegate.findMany({
        ...(where && { where }),
        ...(select && { select }),
        ...(orderBy && { orderBy }),
        ...(calculatedSkip !== undefined && { skip: calculatedSkip }),
        ...(calculatedTake !== undefined && { take: calculatedTake })
    });
}

/**
 * Updates a single record in a specified Prisma table.
 * 
 * @template W - The type of the where clause
 * @template D - The type of the data to update
 * @param {ModelName} tableName - The name of the Prisma model/table to update
 * @param {W} query - The where clause to identify the record to update
 * @param {D} data - The data object containing the fields to update
 * @returns {Promise} A promise that resolves to the updated record
 * @throws {Error} If the specified table does not exist in the Prisma Client
 * @throws {Error} If the record to update is not found
 * 
 * @example
 * // Update a user's name
 * await updateRecord('User', { id: '123' }, { name: 'John Doe' });
 * 
 * @example
 * // Update multiple fields
 * await updateRecord('User', { id: '123' }, { 
 *   name: 'John Doe', 
 *   email: 'john.doe@example.com' 
 * });
 */
const updateRecord = <
    W extends Record<string, any>,
    D extends Record<string, any>
>(
    tableName: ModelName, 
    query: W, 
    data: D
) => {
    const delegate = getDelegate(tableName);
    
    return delegate.update({
        where: query,
        data
    });
}

/**
 * Inserts a new record or updates an existing one based on a unique constraint.
 * 
 * @template W - The type of the where clause
 * @template U - The type of the update data
 * @template C - The type of the create data
 * @param {ModelName} tableName - The name of the Prisma model/table to upsert into
 * @param {W} query - The where clause to identify if the record exists (must use unique fields)
 * @param {U} dataUpdate - The data to update if the record exists
 * @param {C} [dataCreate] - The data to create if the record doesn't exist (defaults to dataUpdate)
 * @returns {Promise} A promise that resolves to the upserted record
 * @throws {Error} If the specified table does not exist in the Prisma Client
 * @throws {Error} If there is an error during the upsert operation
 * 
 * @example
 * // Upsert a user (create if not exists, update if exists)
 * await upsertRecord(
 *   'User', 
 *   { email: 'john@example.com' },
 *   { name: 'John Doe' },
 *   { email: 'john@example.com', name: 'John Doe', password: 'hash' }
 * );
 */
const upsertRecord = <
    W extends Record<string, any>,
    U extends Record<string, any>,
    C extends Record<string, any> = U
>(
    tableName: ModelName, 
    query: W, 
    dataUpdate: U, 
    dataCreate?: C
) => {
    const delegate = getDelegate(tableName);

    return delegate.upsert({
        where: query,
        update: dataUpdate,
        create: (dataCreate || dataUpdate) as any
    });
}

/**
 * Deletes a single record from a specified Prisma table.
 * 
 * @template W - The type of the where clause
 * @param {ModelName} tableName - The name of the Prisma model/table to delete from
 * @param {W} query - The where clause to identify the record to delete (must use unique fields)
 * @returns {Promise} A promise that resolves to the deleted record
 * @throws {Error} If the specified table does not exist in the Prisma Client
 * @throws {Error} If the record to delete is not found
 * 
 * @example
 * // Delete a user by ID
 * await deleteRecord('User', { id: '123' });
 * 
 * @example
 * // Delete a user by email
 * await deleteRecord('User', { email: 'john@example.com' });
 */
const deleteRecord = <W extends Record<string, any>>(
    tableName: ModelName, 
    query: W
) => {
    const delegate = getDelegate(tableName);

    return delegate.delete({
        where: query
    });
}

/**
 * Counts the number of records in a specified Prisma table matching the where clause.
 * 
 * @template W - The type of the where clause
 * @param {ModelName} tableName - The name of the Prisma model/table to count from
 * @param {W} [where] - Optional where clause to filter records
 * @returns {Promise<number>} A promise that resolves to the count of records
 * @throws {Error} If the specified table does not exist in the Prisma Client
 * 
 * @example
 * // Count all users
 * await countRecords('User');
 * 
 * @example
 * // Count users with a specific email domain
 * await countRecords('User', { email: { contains: '@example.com' } });
 */
const countRecords = <W extends Record<string, any> = any>(
    tableName: ModelName,
    where?: W
) => {
    const delegate = getDelegate(tableName);

    return delegate.count({
        ...(where && { where })
    });
}

/**
 * Finds the first record matching the criteria (non-unique lookup).
 * Unlike findUnique, this doesn't require unique fields.
 * 
 * @template T - The type of the where clause
 * @template S - The type of the select clause
 * @param {ModelName} tableName - The name of the Prisma model/table to query
 * @param {FindManyOptions<T, S>} [options] - Query options including where, select, and ordering
 * @returns {Promise} A promise that resolves to the first found record or null
 * @throws {Error} If the specified table does not exist in the Prisma Client
 * 
 * @example
 * // Find the first user created
 * await findFirstRecord('User', { orderBy: { createdAt: 'asc' } });
 * 
 * @example
 * // Find the first active user
 * await findFirstRecord('User', { where: { email: { contains: '@example.com' } } });
 */
const findFirstRecord = <
    T extends Record<string, any> = any,
    S extends Record<string, boolean> | undefined = undefined
>(
    tableName: ModelName,
    options?: FindManyOptions<T, S>
) => {
    const delegate = getDelegate(tableName);

    const { where, select, orderBy } = options || {};

    return delegate.findFirst({
        ...(where && { where }),
        ...(select && { select }),
        ...(orderBy && { orderBy })
    });
}

/**
 * Updates multiple records in a specified Prisma table that match the where clause.
 * 
 * @template W - The type of the where clause
 * @template D - The type of the data to update
 * @param {ModelName} tableName - The name of the Prisma model/table to update
 * @param {W} where - The where clause to identify records to update
 * @param {D} data - The data object containing the fields to update
 * @returns {Promise<{count: number}>} A promise that resolves to an object with the count of updated records
 * @throws {Error} If the specified table does not exist in the Prisma Client
 * 
 * @example
 * // Update all users with a specific domain
 * await updateManyRecords('User', 
 *   { email: { contains: '@old.com' } },
 *   { email: { set: 'migrated@new.com' } }
 * );
 * 
 * @example
 * // Update storage quota for all users
 * await updateManyRecords('User', {}, { storageQuota: 20000000000 });
 */
const updateManyRecords = <
    W extends Record<string, any>,
    D extends Record<string, any>
>(
    tableName: ModelName,
    where: W,
    data: D
) => {
    const delegate = getDelegate(tableName);

    return delegate.updateMany({
        where,
        data
    });
}

/**
 * Deletes multiple records from a specified Prisma table that match the where clause.
 * 
 * @template W - The type of the where clause
 * @param {ModelName} tableName - The name of the Prisma model/table to delete from
 * @param {W} where - The where clause to identify records to delete
 * @returns {Promise<{count: number}>} A promise that resolves to an object with the count of deleted records
 * @throws {Error} If the specified table does not exist in the Prisma Client
 * 
 * @example
 * // Delete all soft-deleted files
 * await deleteManyRecords('File', { isDeleted: true });
 * 
 * @example
 * // Delete all expired shares
 * await deleteManyRecords('Share', { expiresAt: { lt: new Date() } });
 */
const deleteManyRecords = <W extends Record<string, any>>(
    tableName: ModelName,
    where: W
) => {
    const delegate = getDelegate(tableName);

    return delegate.deleteMany({
        where
    });
}

/**
 * Executes multiple database operations in a transaction.
 * All operations succeed or all fail together, ensuring data consistency.
 * 
 * @template T - The return type of the transaction callback
 * @param {function} callback - A callback function that receives the Prisma client and performs operations
 * @returns {Promise<T>} A promise that resolves to the result of the callback
 * @throws {Error} If any operation in the transaction fails, all changes are rolled back
 * 
 * @example
 * // Transfer storage quota between users
 * await executeTransaction(async (tx) => {
 *   const fromUser = await tx.user.update({
 *     where: { id: 'user1' },
 *     data: { storageQuota: { decrement: 1000000 } }
 *   });
 *   
 *   const toUser = await tx.user.update({
 *     where: { id: 'user2' },
 *     data: { storageQuota: { increment: 1000000 } }
 *   });
 *   
 *   return { fromUser, toUser };
 * });
 */
const executeTransaction = async <T>(
    callback: (tx: Omit<PrismaClient, '$connect' | '$disconnect' | '$on' | '$transaction' | '$use' | '$extends'>) => Promise<T>
): Promise<T> => {
    return prisma.$transaction(callback);
}

/**
 * Executes a raw SQL query and returns the results.
 * Use this for complex queries that can't be expressed with Prisma's query builder.
 * 
 * @template T - The expected return type of the query
 * @param {string} query - The SQL query to execute (use parameterized queries for safety)
 * @param {any[]} [params] - Optional parameters for the query
 * @returns {Promise<T>} A promise that resolves to the query results
 * 
 * @example
 * // Get user statistics
 * const stats = await executeRawQuery<{ total: number, active: number }[]>(
 *   'SELECT COUNT(*) as total, COUNT(CASE WHEN "lastLogin" > NOW() - INTERVAL \'30 days\' THEN 1 END) as active FROM users'
 * );
 */
const executeRawQuery = async <T = any>(
    query: string,
    ...params: any[]
): Promise<T> => {
    return prisma.$queryRawUnsafe<T>(query, ...params);
}


export { 
    prisma, 
    getPrismaClient,
    disconnectPrismaClient,
    insertRecord, 
    findRecord, 
    findFirstRecord,
    findManyRecords, 
    countRecords,
    updateRecord, 
    updateManyRecords,
    upsertRecord, 
    deleteRecord,
    deleteManyRecords,
    executeTransaction,
    executeRawQuery
};