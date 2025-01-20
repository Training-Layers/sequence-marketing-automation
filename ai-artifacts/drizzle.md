Create a `index.ts` file in the `src/db` directory and initialize the connection:

```typescript copy filename="index.ts"
import { drizzle } from 'drizzle-orm';

async function main() {
  const db = drizzle('postgres-js', process.env.DATABASE_URL);
}

main();
```

If you need a synchronous connection, you can use our additional connection API,
where you specify a driver connection and pass it to the Drizzle instance.

```typescript copy filename="index.ts"
import { drizzle } from 'drizzle-orm/postgres-js';
import postgres from 'postgres';

async function main() {
  const client = postgres(process.env.DATABASE_URL);
  const db = drizzle({ client });
}

main();
```

<Callout title='tips'>
If you decide to use connection pooling via Supabase (described [here](https://supabase.com/docs/guides/database/connecting-to-postgres#connection-pooler)), and have "Transaction" pool mode enabled, then ensure to turn off prepare, as prepared statements are not supported.

```typescript copy filename="index.ts"
import { drizzle } from 'drizzle-orm/postgres-js';
import postgres from 'postgres';

async function main() {
  // Disable prefetch as it is not supported for "Transaction" pool mode
  const client = postgres(process.env.DATABASE_URL, { prepare: false });
  const db = drizzle({ client });
}

main();
```

</Callout>

# Drizzle schema

Drizzle lets you define a schema in TypeScript with various models and properties supported by the underlying database.
When you define your schema, it serves as the source of truth for future modifications in queries (using Drizzle-ORM)
and migrations (using Drizzle-Kit).

<Callout> 
If you are using Drizzle-Kit for the migration process, make sure to export all the models defined in your schema files so that Drizzle-Kit can import them and use them in the migration diff process. 
</Callout>

## Organize your schema files

You can declare your SQL schema directly in TypeScript either in a single `schema.ts` file,
or you can spread them around — whichever you prefer, all the freedom!

#### Schema in 1 file

The most common way to declare your schema with Drizzle is to put all your tables into one `schema.ts` file.

> Note: You can name your schema file whatever you like. For example, it could be `models.ts`, or something else.

This approach works well if you don't have too many table models defined, or if you're okay with keeping them all in one file

Example:
`plaintext
📦 <project root>
 └ 📂 src
    └ 📂 db
       └ 📜 schema.ts
    `

In the `drizzle.config.ts` file, you need to specify the path to your schema file. With this configuration, Drizzle will
read from the `schema.ts` file and use this information during the migration generation process. For more information
about the `drizzle.config.ts` file and migrations with Drizzle, please check: [link](/docs/drizzle-config-file)

```ts
import { defineConfig } from 'drizzle-kit';

export default defineConfig({
  dialect: 'postgresql', // 'mysql' | 'sqlite' | 'turso'
  schema: './src/db/schema.ts',
});
```

#### Schema in multiple files

You can place your Drizzle models — such as tables, enums, sequences, etc. — not only in one file but in any file you prefer.
The only thing you must ensure is that you export all the models from those files so that the Drizzle kit can import
them and use them in migrations.

One use case would be to separate each table into its own file.

```plaintext
📦 <project root>
 └ 📂 src
    └ 📂 db
       └ 📂 schema
          ├ 📜 users.ts
          ├ 📜 countries.ts
          ├ 📜 cities.ts
          ├ 📜 products.ts
          ├ 📜 clients.ts
          └ 📜 etc.ts
```

In the `drizzle.config.ts` file, you need to specify the path to your schema folder. With this configuration, Drizzle will
read from the `schema` folder and find all the files recursively and get all the drizzle tables from there. For more information
about the `drizzle.config.ts` file and migrations with Drizzle, please check: [link](/docs/drizzle-config-file)

```ts
import { defineConfig } from 'drizzle-kit';

export default defineConfig({
  dialect: 'postgresql', // 'mysql' | 'sqlite' | 'turso'
  schema: './src/db/schema',
});
```

You can also group them in any way you like, such as creating groups for user-related tables, messaging-related tables, product-related tables, etc.

```plaintext
📦 <project root>
 └ 📂 src
    └ 📂 db
       └ 📂 schema
          ├ 📜 users.ts
          ├ 📜 messaging.ts
          └ 📜 products.ts
```

In the `drizzle.config.ts` file, you need to specify the path to your schema file. With this configuration, Drizzle will
read from the `schema.ts` file and use this information during the migration generation process. For more information
about the `drizzle.config.ts` file and migrations with Drizzle, please check: [link](/docs/drizzle-config-file)

```ts
import { defineConfig } from 'drizzle-kit';

export default defineConfig({
  dialect: 'postgresql', // 'mysql' | 'sqlite' | 'turso'
  schema: './src/db/schema',
});
```

## Shape your data schema

Drizzle schema consists of several model types from database you are using. With drizzle you can specify:

- Tables with columns, constraints, etc.
- Schemas(PostgreSQL only)
- Enums
- Sequences(PostgreSQL only)
- Views
- Materialized Views
- etc.

Let's go one by one and check how the schema should be defined with drizzle

#### **Tables and columns declaration**

A table in Drizzle should be defined with at least 1 column, the same as it should be done in database. There is one important thing to know,
there is no such thing as a common table object in drizzle. You need to choose a dialect you are using, PostgreSQL, MySQL or SQLite

![](@/assets/images/table-structure.svg)

<CodeTabs items={["PostgreSQL Table", "MySQL Table", "SQLite Table"]}>

```ts copy
import { pgTable, integer } from 'drizzle-orm/pg-core';

export const users = pgTable('users', {
  id: integer(),
});
```

```ts copy
import { mysqlTable, int } from 'drizzle-orm/mysql-core';

export const users = mysqlTable('users', {
  id: int(),
});
```

```ts copy
import { sqliteTable, integer } from 'drizzle-orm/sqlite-core';

export const users = sqliteTable('users', {
  id: integer(),
});
```

</CodeTabs>

By default, Drizzle will use the TypeScript key names for columns in database queries.
Therefore, the schema and query from the example will generate the SQL query shown below

<Callout>
This example uses a db object, whose initialization is not covered in this part of the documentation. To learn how to connect to the database, please refer to the [Connections Docs](/docs/get-started-postgresql)
</Callout>

\
**TypeScript key = database key**

<Section>
```ts
// schema.ts
import { integer, pgTable, varchar } from "drizzle-orm/pg-core";

export const users = pgTable('users', {
id: integer(),
first_name: varchar()
})

````
```ts
// query.ts
await db.select().from(users);
````

```sql
SELECT "id", "first_name" from users;
```

</Section>

If you want to use different names in your TypeScript code and in the database, you can use column aliases

<Section>
```ts
// schema.ts
import { integer, pgTable, varchar } from "drizzle-orm/pg-core";

export const users = pgTable('users', {
id: integer(),
firstName: varchar('first_name')
})

````
```ts
// query.ts
await db.select().from(users);
````

```sql
SELECT "id", "first_name" from users;
```

</Section>

### Camel and Snake casing

Database model names often use `snake_case` conventions, while in TypeScript, it is common to use `camelCase` for naming models.
This can lead to a lot of alias definitions in the schema. To address this, Drizzle provides a way to automatically
map `camelCase` from TypeScript to `snake_case` in the database by including one optional parameter during Drizzle database initialization

For such mapping, you can use the `casing` option in the Drizzle DB declaration. This parameter will
help you specify the database model naming convention and will attempt to map all JavaScript keys accordingly

<Section>
```ts
// schema.ts
import { drizzle } from "drizzle-orm/node-postgres";
import { integer, pgTable, varchar } from "drizzle-orm/pg-core";

export const users = pgTable('users', {
id: integer(),
firstName: varchar()
})

````
```ts
// db.ts
const db = drizzle({ connection: process.env.DATABASE_URL, casing: 'snake_case' })
````

```ts
// query.ts
await db.select().from(users);
```

```sql
SELECT "id", "first_name" from users;
```

</Section>

### Advanced

There are a few tricks you can use with Drizzle ORM. As long as Drizzle is entirely in TypeScript files,
you can essentially do anything you would in a simple TypeScript project with your code.

One common feature is to separate columns into different places and then reuse them.
For example, consider the `updated_at`, `created_at`, and `deleted_at` columns. Many tables/models may need these
three fields to track and analyze the creation, deletion, and updates of entities in a system

We can define those columns in a separate file and then import and spread them across all the table objects you have

<Section>
```ts
// columns.helpers.ts
const timestamps = {
  updated_at: timestamp(),
  created_at: timestamp().defaultNow().notNull(),
  deleted_at: timestamp(),
}
```
```ts
// users.sql.ts
export const users = pgTable('users', {
  id: integer(),
  ...timestamps
})
```
```ts
// posts.sql.ts
export const posts = pgTable('posts', {
  id: integer(),
  ...timestamps
})
```
</Section>

#### **Schemas**

<Tabs items={['PostgreSQL', 'MySQL', 'SQLite']}>
<Tab>
\
In PostgreSQL, there is an entity called a `schema` (which we believe should be called `folders`). This creates a structure in PostgreSQL:

![](@/assets/images/postgresql-db-structure.png)

You can manage your PostgreSQL schemas with `pgSchema` and place any other models inside it.

Define the schema you want to manage using Drizzle

```ts
import { pgSchema } from 'drizzle-orm/pg-core';

export const customSchema = pgSchema('custom');
```

Then place the table inside the schema object

```ts {5-7}
import { integer, pgSchema } from 'drizzle-orm/pg-core';

export const customSchema = pgSchema('custom');

export const users = customSchema.table('users', {
  id: integer(),
});
```

</Tab>
<Tab>
\
In MySQL, there is an entity called `Schema`, but in MySQL terms, this is equivalent to a `Database`.

You can define them with `drizzle-orm` and use them in queries, but they won't be detected by `drizzle-kit` or included in the migration flow

![](@/assets/images/mysql-db-structure.png)

Define the schema you want to manage using Drizzle

```ts
import { mysqlSchema } from 'drizzle-orm/mysql-core';

export const customSchema = mysqlSchema('custom');
```

Then place the table inside the schema object

```ts {5-7}
import { int, mysqlSchema } from 'drizzle-orm/mysql-core';

export const customSchema = mysqlSchema('custom');

export const users = customSchema.table('users', {
  id: int(),
});
```

</Tab>
<Tab>
\
In SQLite, there is no concept of a schema, so you can only define tables within a single SQLite file context

![](@/assets/images/sqlite-db-structure.png)
</Tab>
</Tabs>

### Example

Once you know the basics, let's define a schema example for a real project to get a better view and understanding

> All examples will use `generateUniqueString`. The implementation for it will be provided after all the schema examples

<CodeTabs items={['PostgreSQL', 'MySQL', 'SQLite']}>

```ts copy
import { AnyPgColumn } from 'drizzle-orm/pg-core';
import { pgEnum, pgTable as table } from 'drizzle-orm/pg-core';
import * as t from 'drizzle-orm/pg-core';

export const rolesEnum = pgEnum('roles', ['guest', 'user', 'admin']);

export const users = table(
  'users',
  {
    id: t.integer().primaryKey().generatedAlwaysAsIdentity(),
    firstName: t.varchar('first_name', { length: 256 }),
    lastName: t.varchar('last_name', { length: 256 }),
    email: t.varchar().notNull(),
    invitee: t.integer().references((): AnyPgColumn => users.id),
    role: rolesEnum().default('guest'),
  },
  (table) => {
    return {
      emailIndex: t.uniqueIndex('email_idx').on(table.email),
    };
  },
);

export const posts = table(
  'posts',
  {
    id: t.integer().primaryKey().generatedAlwaysAsIdentity(),
    slug: t.varchar().$default(() => generateUniqueString(16)),
    title: t.varchar({ length: 256 }),
    ownerId: t.integer('owner_id').references(() => users.id),
  },
  (table) => {
    return {
      slugIndex: t.uniqueIndex('slug_idx').on(table.slug),
      titleIndex: t.index('title_idx').on(table.title),
    };
  },
);

export const comments = table('comments', {
  id: t.integer().primaryKey().generatedAlwaysAsIdentity(),
  text: t.varchar({ length: 256 }),
  postId: t.integer('post_id').references(() => posts.id),
  ownerId: t.integer('owner_id').references(() => users.id),
});
```

```ts copy
import { mysqlTable as table } from 'drizzle-orm/mysql-core';
import * as t from 'drizzle-orm/mysql-core';
import { AnyMySqlColumn } from 'drizzle-orm/mysql-core';

export const users = table(
  'users',
  {
    id: t.int().primaryKey().autoincrement(),
    firstName: t.varchar('first_name', { length: 256 }),
    lastName: t.varchar('last_name', { length: 256 }),
    email: t.varchar({ length: 256 }).notNull(),
    invitee: t.int().references((): AnyMySqlColumn => users.id),
    role: t.mysqlEnum(['guest', 'user', 'admin']).default('guest'),
  },
  (table) => {
    return {
      emailIndex: t.uniqueIndex('email_idx').on(table.email),
    };
  },
);

export const posts = table(
  'posts',
  {
    id: t.int().primaryKey().autoincrement(),
    slug: t.varchar({ length: 256 }).$default(() => generateUniqueString(16)),
    title: t.varchar({ length: 256 }),
    ownerId: t.int('owner_id').references(() => users.id),
  },
  (table) => {
    return {
      slugIndex: t.uniqueIndex('slug_idx').on(table.slug),
      titleIndex: t.index('title_idx').on(table.title),
    };
  },
);

export const comments = table('comments', {
  id: t.int().primaryKey().autoincrement(),
  text: t.varchar({ length: 256 }),
  postId: t.int('post_id').references(() => posts.id),
  ownerId: t.int('owner_id').references(() => users.id),
});
```

```ts copy
import { sqliteTable as table } from 'drizzle-orm/sqlite-core';
import * as t from 'drizzle-orm/sqlite-core';
import { AnySQLiteColumn } from 'drizzle-orm/sqlite-core';

export const users = table(
  'users',
  {
    id: t.int().primaryKey({ autoIncrement: true }),
    firstName: t.text('first_name'),
    lastName: t.text('last_name'),
    email: t.text().notNull(),
    invitee: t.int().references((): AnySQLiteColumn => users.id),
    role: t.text().$type<'guest' | 'user' | 'admin'>().default('guest'),
  },
  (table) => {
    return {
      emailIndex: t.uniqueIndex('email_idx').on(table.email),
    };
  },
);

export const posts = table(
  'posts',
  {
    id: t.int().primaryKey({ autoIncrement: true }),
    slug: t.text().$default(() => generateUniqueString(16)),
    title: t.text(),
    ownerId: t.int('owner_id').references(() => users.id),
  },
  (table) => {
    return {
      slugIndex: t.uniqueIndex('slug_idx').on(table.slug),
      titleIndex: t.index('title_idx').on(table.title),
    };
  },
);

export const comments = table('comments', {
  id: t.int().primaryKey({ autoIncrement: true }),
  text: t.text({ length: 256 }),
  postId: t.int('post_id').references(() => posts.id),
  ownerId: t.int('owner_id').references(() => users.id),
});
```

</CodeTabs>

**`generateUniqueString` implementation:**

```ts
function generateUniqueString(length: number = 12): string {
  const characters = 'ABCDEFGHIJKLMNOPQRSTUVWXYZabcdefghijklmnopqrstuvwxyz0123456789';
  let uniqueString = '';

  for (let i = 0; i < length; i++) {
    const randomIndex = Math.floor(Math.random() * characters.length);
    uniqueString += characters[randomIndex];
  }

  return uniqueString;
}
```

#### What's next?

<br/>
<Flex>
  <LinksList 
    title='Manage schema'
    links={[
        ["Column types", "/docs/column-types/pg"], 
        ["Indexes and Constraints", "/docs/indexes-constraints"],
        ["Database Views", "/docs/views"],
        ["Database Schemas", "/docs/schemas"],
        ["Sequences", "/docs/sequences"],
        ["Extensions", "/docs/extensions/pg"],
      ]}
  />
  <LinksList 
    title='Zero to Hero'
    links={[
        ["Database connection", "/docs/connect-overview"], 
        ["Data querying", "/docs/data-querying"], 
        ["Migrations", "/docs/migrations"], 
      ]}
  />
</Flex>

# Database connection with Drizzle

Drizzle ORM runs SQL queries on your database via **database drivers**.
<CodeTabs items={["index.ts", "schema.ts"]}>

<CodeTab>
```ts
import { drizzle } from "drizzle-orm/node-postgres"
import { users } from "./schema"

const db = drizzle(process.env.DATABASE_URL);
const usersCount = await db.$count(users);

```

```

                        ┌──────────────────────┐
                        │   db.$count(users)   │ <--- drizzle query
                        └──────────────────────┘
                            │               ʌ

select count(\*) from users -│ │
│ │- [{ count: 0 }]
v │
┌─────────────────────┐
│ node-postgres │ <--- database driver
└─────────────────────┘
│ ʌ
01101000 01100101 01111001 -│ │
│ │- 01110011 01110101 01110000
v │
┌────────────────────┐
│ Database │
└────────────────────┘

````
</CodeTab>

```ts
import { pgTable, integer, text } from "drizzle-orm";

export const users = pgTable("users", {
  id: integer("id").generateAlwaysAsIdentity(),
  name: text("name"),
})
````

</CodeTabs>

Under the hood Drizzle will create a **node-postgres** driver instance which you can access via `db.$client` if necessary

<Section>
```ts
import { drizzle } from "drizzle-orm/node-postgres"

const db = drizzle(process.env.DATABASE_URL);
const pool = db.$client;

````
```ts
// above is equivalent to
import { drizzle } from "drizzle-orm/node-postgres";
import { Pool } from "pg";

const pool = new Pool({
  connectionString: process.env.DATABASE_URL,
});
const db = drizzle({ client: pool });
````

</Section>

Drizzle is by design natively compatible with every **edge** or **serverless** runtime, whenever you'd need access to a serverless database - we've got you covered

<CodeTabs items={["Neon HTTP", "Neon with websockets", "Vercel Postgres", "PlanetScale HTTP", "Cloudflare d1"]}>

```ts
import { drizzle } from 'drizzle-orm/neon-http';

const db = drizzle(process.env.DATABASE_URL);
```

```ts
import { drizzle } from 'drizzle-orm/neon-serverless';

const db = drizzle(process.env.DATABASE_URL);
```

```ts
import { drizzle } from 'drizzle-orm/vercel-postgres';

const db = drizzle();
```

```ts
import { drizzle } from 'drizzle-orm/planetscale';

const db = drizzle(process.env.DATABASE_URL);
```

```ts
import { drizzle } from 'drizzle-orm/d1';

const db = drizzle({ connection: env.DB });
```

</CodeTabs>

And yes, we do support runtime specific drivers like [Bun SQLite](/docs/connect-bun-sqlite) or [Expo SQLite](/docs/connect-expo-sqlite):

<Section>
```ts
import { drizzle } from "drizzle-orm/bun-sqlite"

const db = drizzle(); // <--- will create an in-memory db
const db = drizzle("./sqlite.db");

````
```ts
import { drizzle } from "drizzle-orm/expo-sqlite";
import { openDatabaseSync } from "expo-sqlite/next";

const expo = openDatabaseSync("db.db");
const db = drizzle(expo);
````

</Section>

#### Database connection URL

Just in case if you're not familiar with database connection URL concept

```
postgresql://alex:AbC123dEf@ep-cool-darkness-123456.us-east-2.aws.neon.tech/dbname
             └──┘ └───────┘ └─────────────────────────────────────────────┘ └────┘
              ʌ    ʌ          ʌ                                              ʌ
        role -│    │          │- hostname                                    │- database
                   │
                   │- password

```

#### Next steps

Feel free to check out per-driver documentations

<rem/>
<Flex>
  <LinksList 
    title='PostgreSQL drivers'
    links={[
        ["PostgreSQL", "/docs/get-started-postgresql"], 
        ["Neon", "/docs/connect-neon"], 
        ["Vercel Postgres", "/docs/connect-vercel-postgres"],
        ["Supabase", "/docs/connect-supabase"],
        ["Xata", "/docs/connect-xata"],
        ["PGLite", "/docs/connect-pglite"],
      ]}
  />
  <LinksList 
    title='MySQL drivers'
    links={[
        ["MySQL", "/docs/get-started-mysql"], 
        ["PlanetsScale", "/docs/connect-planetscale"], 
        ["TiDB", "/docs/connect-tidb"],
      ]}
  />
  <LinksList 
  title='SQLite drivers'
  links={[
      ["SQLite", "/docs/get-started-sqlite"], 
      ["Turso", "/docs/connect-turso"], 
      ["Cloudflare D1", "/docs/connect-cloudflare-d1"],
      ["Bun SQLite", "/docs/connect-bun-sqlite"],
    ]}
  />
  <LinksList 
  title='Native SQLite'
  links={[
      ["Expo SQLite", "/docs/get-started/expo-new"], 
      ["OP SQLite", "/docs/connect-op-sqlite"], 
      ["React Native SQLite", "/docs/connect-react-native-sqlite"],
    ]}
  />
  <LinksList 
  title='Others'
  links={[
      ["Drizzle Proxy", "/docs/connect-drizzle-proxy"], 
    ]}
  />
</Flex>
{/* TODO: @AndriiSherman ["AWS Data API", "/docs/get-started/aws-data-api"],  */}

# Drizzle Queries + CRUD

<Prerequisites>
  - How to define your schema - [Schema Fundamentals](/docs/sql-schema-declaration)
  - How to connect to the database - [Connection Fundamentals](/docs/connect-overview)
</Prerequisites>

Drizzle gives you a few ways for querying you database and it's up to you to decide which one you'll need in your next project.
It can be either SQL-like syntax or Relational Syntax. Let's check them:

## Why SQL-like?

\
**If you know SQL, you know Drizzle.**

Other ORMs and data frameworks tend to deviate from or abstract away SQL, leading to a double learning curve: you need to learn both SQL and the framework's API.

Drizzle is the opposite.
We embrace SQL and built Drizzle to be SQL-like at its core, so you have little to no learning curve and full access to the power of SQL.

<Section>
```typescript copy
// Access your data
await db
  .select()
	.from(posts)
	.leftJoin(comments, eq(posts.id, comments.post_id))
	.where(eq(posts.id, 10))
```
```sql
SELECT * 
FROM posts
LEFT JOIN comments ON posts.id = comments.post_id
WHERE posts.id = 10
```
</Section>

With SQL-like syntax, you can replicate much of what you can do with pure SQL and know
exactly what Drizzle will do and what query will be generated. You can perform a wide range of queries,
including select, insert, update, delete, as well as using aliases, WITH clauses, subqueries, prepared statements,
and more. Let's look at more examples

<CodeTabs items={['insert', 'update', 'delete']}>

<Section>
```ts
await db.insert(users).values({ email: 'user@gmail.com' })
```
```sql
INSERT INTO users (email) VALUES ('user@gmail.com')
```
</Section>
<Section>
```ts
await db.update(users)
        .set({ email: 'user@gmail.com' })
        .where(eq(users.id, 1))
```
```sql
UPDATE users 
SET email = 'user@gmail.com'
WHERE users.id = 1
```
</Section>
<Section>
```ts
await db.delete(users).where(eq(users.id, 1))
```
```sql
DELETE FROM users WHERE users.id = 1
```
</Section>
</CodeTabs>

## Why not SQL-like?

We're always striving for a perfectly balanced solution. While SQL-like queries cover 100% of your needs,
there are certain common scenarios where data can be queried more efficiently.

We've built the Queries API so you can fetch relational, nested data from the database in the most convenient
and performant way, without worrying about joins or data mapping.

**Drizzle always outputs exactly one SQL query**. Feel free to use it with serverless databases,
and never worry about performance or roundtrip costs!

<Section>
```ts
const result = await db.query.users.findMany({
	with: {
		posts: true
	},
});
```
{/* ```sql
SELECT * FROM users ...
``` */}
</Section>

## Advanced

With Drizzle, queries can be composed and partitioned in any way you want. You can compose filters
independently from the main query, separate subqueries or conditional statements, and much more.
Let's check a few advanced examples:

#### Compose a WHERE statement and then use it in a query

```ts
async function getProductsBy({
  name,
  category,
  maxPrice,
}: {
  name?: string;
  category?: string;
  maxPrice?: string;
}) {
  const filters: SQL[] = [];

  if (name) filters.push(ilike(products.name, name));
  if (category) filters.push(eq(products.category, category));
  if (maxPrice) filters.push(lte(products.price, maxPrice));

  return db
    .select()
    .from(products)
    .where(and(...filters));
}
```

#### Separate subqueries into different variables, and then use them in the main query

```ts
const subquery = db
  .select()
  .from(internalStaff)
  .leftJoin(customUser, eq(internalStaff.userId, customUser.id))
  .as('internal_staff');

const mainQuery = await db
  .select()
  .from(ticket)
  .leftJoin(subquery, eq(subquery.internal_staff.userId, ticket.staffId));
```

#### What's next?

<br/>
<Flex>
  <LinksList 
    title='Access your data'
    links={[
        ["Query", "/docs/rqb"], 
        ["Select", "/docs/select"],
        ["Insert", "/docs/insert"],
        ["Update", "/docs/update"],
        ["Delete", "/docs/delete"],
        ["Filters", "/docs/operators"],
        ["Joins", "/docs/joins"],
        ["sql`` operator", "/docs/sql"],
      ]}
  />
  <LinksList 
    title='Zero to Hero'
    links={[
        ["Migrations", "/docs/migrations"], 
      ]}
  />
</Flex>

import CodeTab from "@mdx/CodeTab.astro";
import CodeTabs from "@mdx/CodeTabs.astro";
import Section from "@mdx/Section.astro";
import Tab from "@mdx/Tab.astro";
import Tabs from "@mdx/Tabs.astro";
import Callout from "@mdx/Callout.astro";
import SchemaFilePaths from "@mdx/SchemaFilePaths.mdx"
import Prerequisites from "@mdx/Prerequisites.astro"
import Dialects from "@mdx/Dialects.mdx"
import Drivers from "@mdx/Drivers.mdx"
import DriversExamples from "@mdx/DriversExamples.mdx"
import Npx from "@mdx/Npx.astro"

# Drizzle Kit configuration file

<Prerequisites>
- Get started with Drizzle and `drizzle-kit` - [read here](/docs/get-started)
- Drizzle schema foundamentals - [read here](/docs/sql-schema-declaration)
- Database connection basics - [read here](/docs/connect-overview)
- Drizzle migrations foundamentals - [read here](/docs/migrations)
- Drizzle Kit [overview](/docs/kit-overview) and [config file](/docs/drizzle-config-file)
</Prerequisites>

Drizzle Kit lets you declare configuration options in `TypeScript` or `JavaScript` configuration files.

<Section>
```plaintext {5}
📦 <project root>
 ├ ...
 ├ 📂 drizzle
 ├ 📂 src
 ├ 📜 drizzle.config.ts
 └ 📜 package.json
```
<CodeTabs items={["drizzle.config.ts", "drizzle.config.js"]}>
<CodeTab>
```ts
import { defineConfig } from "drizzle-kit";

export default defineConfig({
dialect: "postgresql",
schema: "./src/schema.ts",
out: "./drizzle",
});

````
</CodeTab>
<CodeTab>
```js
import { defineConfig } from "drizzle-kit";

export default defineConfig({
  dialect: "postgresql",
  schema: "./src/schema.ts",
  out: "./drizzle",
});
````

</CodeTab>
</CodeTabs>
</Section>

Example of an extended config file

```ts collapsable
import { defineConfig } from "drizzle-kit";

export default defineConfig({
  out: "./drizzle",
  dialect: "postgresql",
  schema: "./src/schema.ts",

  driver: "pglite",
  dbCredentials: {
    url: "./database/",
  },

  extensionsFilters: ["postgis"],
  schemaFilter: "public",
  tablesFilter: "*",

  introspect: {
    casing: "camel",
  },

  migrations: {
    prefix: "timestamp",
    table: "__drizzle_migrations__",
    schema: "public",
  },

  entities: {
    roles: {
      provider: '',
      exclude: [],
      include: []
    }
  }

  breakpoints: true,
  strict: true,
  verbose: true,
});
```

### Multiple configuration files

You can have multiple config files in the project, it's very useful when you have multiple database stages or multiple databases or different databases on the same project:
<Npx>
drizzle-kit generate --config=drizzle-dev.config.ts
drizzle-kit generate --config=drizzle-prod.config.ts
</Npx>

```plaintext {5-6}
📦 <project root>
 ├ 📂 drizzle
 ├ 📂 src
 ├ 📜 .env
 ├ 📜 drizzle-dev.config.ts
 ├ 📜 drizzle-prod.config.ts
 ├ 📜 package.json
 └ 📜 tsconfig.json
```

### Migrations folder

`out` param lets you define folder for your migrations, it's optional and `drizzle` by default.  
It's very useful since you can have many separate schemas for different databases in the same project
and have different migration folders for them.

Migration folder contains `.sql` migration files and `_meta` folder which is used by `drizzle-kit`

<Section>
```plaintext {3}
📦 <project root>
 ├ ...
 ├ 📂 drizzle
 │ ├ 📂 _meta
 │ ├ 📜 user.ts 
 │ ├ 📜 post.ts 
 │ └ 📜 comment.ts 
 ├ 📂 src
 ├ 📜 drizzle.config.ts
 └ 📜 package.json
```
```ts {5}
import { defineConfig } from "drizzle-kit";

export default defineConfig({
dialect: "postgresql", // "mysql" | "sqlite" | "postgresql" | "turso" | "singlestore"
schema: "./src/schema/\*",
out: "./drizzle",
});

````
</Section>

## ---

### `dialect`
<rem025/>

Dialect of the database you're using
|               |                                                 |
| :------------ | :-----------------------------------            |
| type        | <Dialects/>                                     |
| default        | --                                     |
| commands    | `generate` `migrate` `push` `pull` `check` `up` |

<rem025/>
```ts {4}
import { defineConfig } from "drizzle-kit";

export default defineConfig({
  dialect: "mysql",
});
````

### `schema`

<rem025/>

[`glob`](https://www.digitalocean.com/community/tools/glob?comments=true&glob=/**/*.js&matches=false&tests=//%20This%20will%20match%20as%20it%20ends%20with%20'.js'&tests=/hello/world.js&tests=//%20This%20won't%20match!&tests=/test/some/globs)
based path to drizzle schema file(s) or folder(s) contaning schema files.
| | |
| :------------ | :----------------- |
| type | `string` `string[]` |
| default | -- |
| commands | `generate` `push` |

<rem025/>
<SchemaFilePaths />

### `out`

<rem025/>

Defines output folder of your SQL migration files, json snapshots of your schema and `schema.ts` from `drizzle-kit pull` command.
| | |
| :------------ | :----------------- |
| type | `string` `string[]` |
| default | `drizzle` |
| commands | `generate` `migrate` `push` `pull` `check` `up` |

<rem025/>
```ts {4}
import { defineConfig } from "drizzle-kit";

export default defineConfig({
out: "./drizzle",
});

````

### `driver`
<rem025/>

Drizzle Kit automatically picks available database driver from your current project based on the provided `dialect`,
yet some vendor specific databases require a different subset of connection params.

`driver` option let's you explicitely pick those exceptions drivers.

|               |                      |
| :------------ | :-----------------   |
| type          | <Drivers/> |
| default        | --                    |
| commands      | `migrate` `push` `pull`   |

<rem025/>

<DriversExamples/>

## ---

### `dbCredentials`
<rem025/>

Database connection credentials in a form of `url`,
`user:password@host:port/db` params or exceptions drivers(<Drivers/>) specific connection options.

|               |                      |
| :------------ | :-----------------   |
| type          | union of drivers connection options |
| default       | --                    |
| commands      | `migrate` `push` `pull`   |

<rem025/>

<CodeTabs items={["PostgreSQL", "MySQL", "SQLite", "Turso", "Cloudflare D1", "AWS Data API", "PGLite"]}>
<Section>
```ts
import { defineConfig } from 'drizzle-kit'

export default defineConfig({
  dialect: "postgresql",
  dbCredentials: {
    url: "postgres://user:password@host:port/db",
  }
})
````

```ts
import { defineConfig } from 'drizzle-kit';

// via connection params
export default defineConfig({
  dialect: 'postgresql',
  dbCredentials: {
    host: 'host',
    port: 5432,
    user: 'user',
    password: 'password',
    database: 'dbname',
    ssl: true, // can be boolean | "require" | "allow" | "prefer" | "verify-full" | options from node:tls
  },
});
```

</Section>
<Section>
```ts
import { defineConfig } from 'drizzle-kit'

export default defineConfig({
dialect: "mysql",
dbCredentials: {
url: "postgres://user:password@host:port/db",
}
})

````
```ts
import { defineConfig } from 'drizzle-kit'

// via connection params
export default defineConfig({
  dialect: "mysql",
  dbCredentials: {
    host: "host",
    port: 5432,
    user: "user",
    password: "password",
    database: "dbname",
    ssl: "...", // can be: string | SslOptions (ssl options from mysql2 package)
  }
})
````

</Section>
```ts
import { defineConfig } from 'drizzle-kit'

export default defineConfig({
dialect: "sqlite",
dbCredentials: {
url: ":memory:", // inmemory database
// or
url: "sqlite.db",
// or
url: "file:sqlite.db" // file: prefix is required by libsql
}
})

````
```ts
import { defineConfig } from 'drizzle-kit'

export default defineConfig({
  dialect: "turso",
  dbCredentials: {
    url: "libsql://acme.turso.io" // remote Turso database url
    authToken: "...",

    // or if you need local db

    url: ":memory:", // inmemory database
    // or
    url: "file:sqlite.db", // file: prefix is required by libsql
  }
})
````

```ts
import { defineConfig } from 'drizzle-kit';

export default defineConfig({
  dialect: 'sqlite',
  driver: 'd1-http',
  dbCredentials: {
    accountId: '',
    databaseId: '',
    token: '',
  },
});
```

```ts
import { defineConfig } from 'drizzle-kit';

export default defineConfig({
  dialect: 'postgresql',
  driver: 'aws-data-api',
  dbCredentials: {
    database: 'database',
    resourceArn: 'resourceArn',
    secretArn: 'secretArn',
  },
});
```

```ts
import { defineConfig } from 'drizzle-kit';

export default defineConfig({
  dialect: 'postgresql',
  driver: 'pglite',
  dbCredentials: {
    url: './database/', // database folder path
  },
});
```

</CodeTabs>

### `migrations`

<rem025/>

When running `drizzle-kit migrate` - drizzle will records about
successfully applied migrations in your database in log table named `__drizzle_migrations` in `public` schema(PostgreSQL only).

`migrations` config options lets you change both migrations log `table` name and `schema`.

|          |                                                        |
| :------- | :----------------------------------------------------- |
| type     | `{ table: string, schema: string }`                    |
| default  | `{ table: "__drizzle_migrations", schema: "drizzle" }` |
| commands | `migrate`                                              |

<rem025/>

```ts
export default defineConfig({
  dialect: 'postgresql',
  schema: './src/schema.ts',
  migrations: {
    table: 'my-migrations-table', // `__drizzle_migrations` by default
    schema: 'public', // used in PostgreSQL only, `drizzle` by default
  },
});
```

### `introspect`

<rem025/>

Cofiguration for `drizzle-kit pull` command.

`casing` is responsible for in-code column keys casing

|          |                                     |
| :------- | :---------------------------------- |
| type     | `{ casing: "preserve" \| "camel" }` |
| default  | `{ casing: "camel" }`               |
| commands | `pull`                              |

<rem025/>

<CodeTabs items={["camel", "preserve"]}>

<Section>
```ts
import * as p from "drizzle-orm/pg-core"

export const users = p.pgTable("users", {
id: p.serial(),
firstName: p.text("first-name"),
lastName: p.text("LastName"),
email: p.text(),
phoneNumber: p.text("phone_number"),
});

````
```sql
SELECT a.attname AS column_name, format_type(a.atttypid, a.atttypmod) as data_type FROM pg_catalog.pg_attribute a;
````

```
 column_name   | data_type
---------------+------------------------
 id            | serial
 first-name    | text
 LastName      | text
 email         | text
 phone_number  | text
```

</Section>
<Section>
```ts
import * as p from "drizzle-orm/pg-core"

export const users = p.pgTable("users", {
id: p.serial(),
"first-name": p.text("first-name"),
LastName: p.text("LastName"),
email: p.text(),
phone_number: p.text("phone_number"),
});

````
```sql
SELECT a.attname AS column_name, format_type(a.atttypid, a.atttypmod) as data_type FROM pg_catalog.pg_attribute a;
````

```
 column_name   | data_type
---------------+------------------------
 id            | serial
 first-name    | text
 LastName      | text
 email         | text
 phone_number  | text
```

</Section>
</CodeTabs>

## ---

### `tablesFilter`

<Callout>
If you want to run multiple projects with one database - check out [our guide](/docs/goodies#multi-project-schema).
</Callout>
<rem025/>
`drizzle-kit push` and `drizzle-kit pull` will by default manage all tables in `public` schema.
You can configure list of tables, schemas and extensions via `tablesFilters`, `schemaFilter` and `extensionFilters` options.

`tablesFilter` option lets you specify [`glob`](https://www.digitalocean.com/community/tools/glob?comments=true&glob=/**/*.js&matches=false&tests=//%20This%20will%20match%20as%20it%20ends%20with%20'.js'&tests=/hello/world.js&tests=//%20This%20won't%20match!&tests=/test/some/globs)
based table names filter, e.g. `["users", "user_info"]` or `"user*"`

|          |                          |
| :------- | :----------------------- |
| type     | `string` `string[]`      |
| default  | --                       |
| commands | `generate` `push` `pull` |

<rem025/>
```ts
import { defineConfig } from "drizzle-kit";

export default defineConfig({
dialect: "postgresql",
tablesFilter: ["users", "posts", "project1_*"],
});

````

### `schemaFilter`
<Callout>
If you want to run multiple projects with one database - check out [our guide](/docs/goodies#multi-project-schema).
</Callout>

<rem025/>
`drizzle-kit push` and `drizzle-kit pull` will by default manage all tables in `public` schema.
You can configure list of tables, schemas and extensions via `tablesFilters`, `schemaFilter` and `extensionFilters` options.

`schemaFilter` option lets you specify list of schemas for Drizzle Kit to manage

|               |                      |
| :------------ | :-----------------   |
| type          | `string[]` |
| default       | `["public"]`                    |
| commands      | `generate` `push` `pull`   |

<rem025/>

```ts
export default defineConfig({
  dialect: "postgresql",
  schemaFilter: ["public", "schema1", "schema2"],
});
````

### `extensionsFilters`

<rem025/>

Some extensions like [`postgis`](https://postgis.net/), when installed on the database, create its own tables in public schema.
Those tables have to be ignored by `drizzle-kit push` or `drizzle-kit pull`.

`extensionsFilters` option lets you declare list of installed extensions for drizzle kit to ignore their tables in the schema.

|          |               |
| :------- | :------------ |
| type     | `["postgis"]` |
| default  | `[]`          |
| commands | `push` `pull` |

<rem025/>

```ts
export default defineConfig({
  dialect: 'postgresql',
  extensionsFilters: ['postgis'],
});
```

## ---

### `entities`

This configuration is created to set up management settings for specific `entities` in the database.

For now, it only includes `roles`, but eventually all database entities will migrate here, such as `tables`, `schemas`, `extensions`, `functions`, `triggers`, etc

#### `roles`

<rem025/>

If you are using Drizzle Kit to manage your schema and especially the defined roles, there may be situations where you have some roles that are not defined in the Drizzle schema.
In such cases, you may want Drizzle Kit to skip those `roles` without the need to write each role in your Drizzle schema and mark it with `.existing()`.

The `roles` option lets you:

- Enable or disable role management with Drizzle Kit.
- Exclude specific roles from management by Drizzle Kit.
- Include specific roles for management by Drizzle Kit.
- Enable modes for providers like `Neon` and `Supabase`, which do not manage their specific roles.
- Combine all the options above

|          |                                                                                      |
| :------- | :----------------------------------------------------------------------------------- |
| type     | `boolean \| { provider: "neon" \| "supabase", include: string[], exclude: string[]}` |
| default  | `false`                                                                              |
| commands | `push` `pull` `generate`                                                             |

<rem025/>

By default, `drizzle-kit` won't manage roles for you, so you will need to enable that. in `drizzle.config.ts`

```ts
export default defineConfig({
  dialect: "postgresql",
  extensionsFilters: entities: {
    roles: true
  }
});
```

**You have a role `admin` and want to exclude it from the list of manageable roles**

```ts
// drizzle.config.ts
import { defineConfig } from "drizzle-kit";

export default defineConfig({
  ...
  entities: {
    roles: {
      exclude: ['admin']
    }
  }
});
```

**You have a role `admin` and want to include to the list of manageable roles**

```ts
// drizzle.config.ts
import { defineConfig } from "drizzle-kit";

export default defineConfig({
  ...
  entities: {
    roles: {
      include: ['admin']
    }
  }
});
```

**If you are using `Neon` and want to exclude roles defined by `Neon`, you can use the provider option**

```ts
// drizzle.config.ts
import { defineConfig } from "drizzle-kit";

export default defineConfig({
  ...
  entities: {
    roles: {
      provider: 'neon'
    }
  }
});
```

**If you are using `Supabase` and want to exclude roles defined by `Supabase`, you can use the provider option**

```ts
// drizzle.config.ts
import { defineConfig } from "drizzle-kit";

export default defineConfig({
  ...
  entities: {
    roles: {
      provider: 'supabase'
    }
  }
});
```

<Callout title='important'>
You may encounter situations where Drizzle is slightly outdated compared to new roles specified by database providers, 
so you may need to use both the `provider` option and `exclude` additional roles. You can easily do this with Drizzle:

```ts
// drizzle.config.ts
import { defineConfig } from "drizzle-kit";

export default defineConfig({
  ...
  entities: {
    roles: {
      provider: 'supabase',
      exclude: ['new_supabase_role']
    }
  }
});
```

</Callout>

## ---

### `strict`

<rem025/>

Prompts confirmation to run printed SQL statements when running `drizzle-kit push` command.

|          |           |
| :------- | :-------- |
| type     | `boolean` |
| default  | `false`   |
| commands | `push`    |

<rem025/>

```ts
export default defineConfig({
  dialect: 'postgresql',
  breakpoints: false,
});
```

### `verbose`

<rem025/>

Print all SQL statements during `drizzle-kit push` command.

|          |                   |
| :------- | :---------------- |
| type     | `boolean`         |
| default  | `true`            |
| commands | `generate` `pull` |

<rem025/>

```ts
export default defineConfig({
  dialect: 'postgresql',
  breakpoints: false,
});
```

### `breakpoints`

<rem025/>

Drizzle Kit will automatically embed `--> statement-breakpoint` into generated SQL migration files,
that's necessary for databases that do not support multiple DDL alternation statements in one transaction(MySQL and SQLite).

`breakpoints` option flag lets you switch it on and off

|          |                   |
| :------- | :---------------- |
| type     | `boolean`         |
| default  | `true`            |
| commands | `generate` `pull` |

<rem025/>

```ts
export default defineConfig({
  dialect: 'postgresql',
  breakpoints: false,
});
```

import Tab from '@mdx/Tab.astro';
import Tabs from '@mdx/Tabs.astro';
import Npm from "@mdx/Npm.astro";
import Callout from '@mdx/Callout.astro';
import Steps from '@mdx/Steps.astro';
import AnchorCards from '@mdx/AnchorCards.astro';
import Prerequisites from "@mdx/Prerequisites.astro";
import WhatsNextPostgres from "@mdx/WhatsNextPostgres.astro";

# Drizzle \<\> Supabase

<Prerequisites>
- Database [connection basics](/docs/connect-overview) with Drizzle
- Drizzle PostgreSQL drivers - [docs](/docs/get-started-postgresql)
</Prerequisites>

According to the **[official website](https://supabase.com/docs)**, Supabase is an open source Firebase alternative for building secure and performant Postgres backends with minimal configuration.

Checkout official **[Supabase + Drizzle](https://supabase.com/docs/guides/database/connecting-to-postgres#connecting-with-drizzle)** docs.

#### Step 1 - Install packages

<Npm>
drizzle-orm postgres
-D drizzle-kit
</Npm>

#### Step 2 - Initialize the driver and make a query

```typescript copy filename="index.ts"
import { drizzle } from 'drizzle-orm/postgres-js'

const db = drizzle(process.env.DATABASE_URL);

const allUsers = await db.select().from(...);
```

If you need to provide your existing driver:

```typescript copy filename="index.ts"
import { drizzle } from 'drizzle-orm/postgres-js'
import postgres from 'postgres'

const client = postgres(process.env.DATABASE_URL)
const db = drizzle({ client });

const allUsers = await db.select().from(...);
```

If you decide to use connection pooling via Supabase (described [here](https://supabase.com/docs/guides/database/connecting-to-postgres#connection-pooler)), and have "Transaction" pool mode enabled, then ensure to turn off prepare, as prepared statements are not supported.

```typescript copy filename="index.ts"
import { drizzle } from 'drizzle-orm/postgres-js'
import postgres from 'postgres'

// Disable prefetch as it is not supported for "Transaction" pool mode
const client = postgres(process.env.DATABASE_URL, { prepare: false })
const db = drizzle({ client });

const allUsers = await db.select().from(...);
```

Connect to your database using the Connection Pooler for **serverless environments**, and the Direct Connection for **long-running servers**.

#### What's next?

<WhatsNextPostgres/>

import CodeTab from "@mdx/CodeTab.astro";
import CodeTabs from "@mdx/CodeTabs.astro";
import Section from "@mdx/Section.astro";
import Tab from "@mdx/Tab.astro";
import Tabs from "@mdx/Tabs.astro";
import Callout from "@mdx/Callout.astro";
import SchemaFilePaths from "@mdx/SchemaFilePaths.mdx"
import Prerequisites from "@mdx/Prerequisites.astro"
import Dialects from "@mdx/Dialects.mdx"
import Drivers from "@mdx/Drivers.mdx"
import DriversExamples from "@mdx/DriversExamples.mdx"
import Npx from "@mdx/Npx.astro"

# Drizzle Kit configuration file

<Prerequisites>
- Get started with Drizzle and `drizzle-kit` - [read here](/docs/get-started)
- Drizzle schema foundamentals - [read here](/docs/sql-schema-declaration)
- Database connection basics - [read here](/docs/connect-overview)
- Drizzle migrations foundamentals - [read here](/docs/migrations)
- Drizzle Kit [overview](/docs/kit-overview) and [config file](/docs/drizzle-config-file)
</Prerequisites>

Drizzle Kit lets you declare configuration options in `TypeScript` or `JavaScript` configuration files.

<Section>
```plaintext {5}
📦 <project root>
 ├ ...
 ├ 📂 drizzle
 ├ 📂 src
 ├ 📜 drizzle.config.ts
 └ 📜 package.json
```
<CodeTabs items={["drizzle.config.ts", "drizzle.config.js"]}>
<CodeTab>
```ts
import { defineConfig } from "drizzle-kit";

export default defineConfig({
dialect: "postgresql",
schema: "./src/schema.ts",
out: "./drizzle",
});

````
</CodeTab>
<CodeTab>
```js
import { defineConfig } from "drizzle-kit";

export default defineConfig({
  dialect: "postgresql",
  schema: "./src/schema.ts",
  out: "./drizzle",
});
````

</CodeTab>
</CodeTabs>
</Section>

Example of an extended config file

```ts collapsable
import { defineConfig } from "drizzle-kit";

export default defineConfig({
  out: "./drizzle",
  dialect: "postgresql",
  schema: "./src/schema.ts",

  driver: "pglite",
  dbCredentials: {
    url: "./database/",
  },

  extensionsFilters: ["postgis"],
  schemaFilter: "public",
  tablesFilter: "*",

  introspect: {
    casing: "camel",
  },

  migrations: {
    prefix: "timestamp",
    table: "__drizzle_migrations__",
    schema: "public",
  },

  entities: {
    roles: {
      provider: '',
      exclude: [],
      include: []
    }
  }

  breakpoints: true,
  strict: true,
  verbose: true,
});
```

### Multiple configuration files

You can have multiple config files in the project, it's very useful when you have multiple database stages or multiple databases or different databases on the same project:
<Npx>
drizzle-kit generate --config=drizzle-dev.config.ts
drizzle-kit generate --config=drizzle-prod.config.ts
</Npx>

```plaintext {5-6}
📦 <project root>
 ├ 📂 drizzle
 ├ 📂 src
 ├ 📜 .env
 ├ 📜 drizzle-dev.config.ts
 ├ 📜 drizzle-prod.config.ts
 ├ 📜 package.json
 └ 📜 tsconfig.json
```

### Migrations folder

`out` param lets you define folder for your migrations, it's optional and `drizzle` by default.  
It's very useful since you can have many separate schemas for different databases in the same project
and have different migration folders for them.

Migration folder contains `.sql` migration files and `_meta` folder which is used by `drizzle-kit`

<Section>
```plaintext {3}
📦 <project root>
 ├ ...
 ├ 📂 drizzle
 │ ├ 📂 _meta
 │ ├ 📜 user.ts 
 │ ├ 📜 post.ts 
 │ └ 📜 comment.ts 
 ├ 📂 src
 ├ 📜 drizzle.config.ts
 └ 📜 package.json
```
```ts {5}
import { defineConfig } from "drizzle-kit";

export default defineConfig({
dialect: "postgresql", // "mysql" | "sqlite" | "postgresql" | "turso" | "singlestore"
schema: "./src/schema/\*",
out: "./drizzle",
});

````
</Section>

## ---

### `dialect`
<rem025/>

Dialect of the database you're using
|               |                                                 |
| :------------ | :-----------------------------------            |
| type        | <Dialects/>                                     |
| default        | --                                     |
| commands    | `generate` `migrate` `push` `pull` `check` `up` |

<rem025/>
```ts {4}
import { defineConfig } from "drizzle-kit";

export default defineConfig({
  dialect: "mysql",
});
````

### `schema`

<rem025/>

[`glob`](https://www.digitalocean.com/community/tools/glob?comments=true&glob=/**/*.js&matches=false&tests=//%20This%20will%20match%20as%20it%20ends%20with%20'.js'&tests=/hello/world.js&tests=//%20This%20won't%20match!&tests=/test/some/globs)
based path to drizzle schema file(s) or folder(s) contaning schema files.
| | |
| :------------ | :----------------- |
| type | `string` `string[]` |
| default | -- |
| commands | `generate` `push` |

<rem025/>
<SchemaFilePaths />

### `out`

<rem025/>

Defines output folder of your SQL migration files, json snapshots of your schema and `schema.ts` from `drizzle-kit pull` command.
| | |
| :------------ | :----------------- |
| type | `string` `string[]` |
| default | `drizzle` |
| commands | `generate` `migrate` `push` `pull` `check` `up` |

<rem025/>
```ts {4}
import { defineConfig } from "drizzle-kit";

export default defineConfig({
out: "./drizzle",
});

````

### `driver`
<rem025/>

Drizzle Kit automatically picks available database driver from your current project based on the provided `dialect`,
yet some vendor specific databases require a different subset of connection params.

`driver` option let's you explicitely pick those exceptions drivers.

|               |                      |
| :------------ | :-----------------   |
| type          | <Drivers/> |
| default        | --                    |
| commands      | `migrate` `push` `pull`   |

<rem025/>

<DriversExamples/>

## ---

### `dbCredentials`
<rem025/>

Database connection credentials in a form of `url`,
`user:password@host:port/db` params or exceptions drivers(<Drivers/>) specific connection options.

|               |                      |
| :------------ | :-----------------   |
| type          | union of drivers connection options |
| default       | --                    |
| commands      | `migrate` `push` `pull`   |

<rem025/>

<CodeTabs items={["PostgreSQL", "MySQL", "SQLite", "Turso", "Cloudflare D1", "AWS Data API", "PGLite"]}>
<Section>
```ts
import { defineConfig } from 'drizzle-kit'

export default defineConfig({
  dialect: "postgresql",
  dbCredentials: {
    url: "postgres://user:password@host:port/db",
  }
})
````

```ts
import { defineConfig } from 'drizzle-kit';

// via connection params
export default defineConfig({
  dialect: 'postgresql',
  dbCredentials: {
    host: 'host',
    port: 5432,
    user: 'user',
    password: 'password',
    database: 'dbname',
    ssl: true, // can be boolean | "require" | "allow" | "prefer" | "verify-full" | options from node:tls
  },
});
```

</Section>
<Section>
```ts
import { defineConfig } from 'drizzle-kit'

export default defineConfig({
dialect: "mysql",
dbCredentials: {
url: "postgres://user:password@host:port/db",
}
})

````
```ts
import { defineConfig } from 'drizzle-kit'

// via connection params
export default defineConfig({
  dialect: "mysql",
  dbCredentials: {
    host: "host",
    port: 5432,
    user: "user",
    password: "password",
    database: "dbname",
    ssl: "...", // can be: string | SslOptions (ssl options from mysql2 package)
  }
})
````

</Section>
```ts
import { defineConfig } from 'drizzle-kit'

export default defineConfig({
dialect: "sqlite",
dbCredentials: {
url: ":memory:", // inmemory database
// or
url: "sqlite.db",
// or
url: "file:sqlite.db" // file: prefix is required by libsql
}
})

````
```ts
import { defineConfig } from 'drizzle-kit'

export default defineConfig({
  dialect: "turso",
  dbCredentials: {
    url: "libsql://acme.turso.io" // remote Turso database url
    authToken: "...",

    // or if you need local db

    url: ":memory:", // inmemory database
    // or
    url: "file:sqlite.db", // file: prefix is required by libsql
  }
})
````

```ts
import { defineConfig } from 'drizzle-kit';

export default defineConfig({
  dialect: 'sqlite',
  driver: 'd1-http',
  dbCredentials: {
    accountId: '',
    databaseId: '',
    token: '',
  },
});
```

```ts
import { defineConfig } from 'drizzle-kit';

export default defineConfig({
  dialect: 'postgresql',
  driver: 'aws-data-api',
  dbCredentials: {
    database: 'database',
    resourceArn: 'resourceArn',
    secretArn: 'secretArn',
  },
});
```

```ts
import { defineConfig } from 'drizzle-kit';

export default defineConfig({
  dialect: 'postgresql',
  driver: 'pglite',
  dbCredentials: {
    url: './database/', // database folder path
  },
});
```

</CodeTabs>

### `migrations`

<rem025/>

When running `drizzle-kit migrate` - drizzle will records about
successfully applied migrations in your database in log table named `__drizzle_migrations` in `public` schema(PostgreSQL only).

`migrations` config options lets you change both migrations log `table` name and `schema`.

|          |                                                        |
| :------- | :----------------------------------------------------- |
| type     | `{ table: string, schema: string }`                    |
| default  | `{ table: "__drizzle_migrations", schema: "drizzle" }` |
| commands | `migrate`                                              |

<rem025/>

```ts
export default defineConfig({
  dialect: 'postgresql',
  schema: './src/schema.ts',
  migrations: {
    table: 'my-migrations-table', // `__drizzle_migrations` by default
    schema: 'public', // used in PostgreSQL only, `drizzle` by default
  },
});
```

### `introspect`

<rem025/>

Cofiguration for `drizzle-kit pull` command.

`casing` is responsible for in-code column keys casing

|          |                                     |
| :------- | :---------------------------------- |
| type     | `{ casing: "preserve" \| "camel" }` |
| default  | `{ casing: "camel" }`               |
| commands | `pull`                              |

<rem025/>

<CodeTabs items={["camel", "preserve"]}>

<Section>
```ts
import * as p from "drizzle-orm/pg-core"

export const users = p.pgTable("users", {
id: p.serial(),
firstName: p.text("first-name"),
lastName: p.text("LastName"),
email: p.text(),
phoneNumber: p.text("phone_number"),
});

````
```sql
SELECT a.attname AS column_name, format_type(a.atttypid, a.atttypmod) as data_type FROM pg_catalog.pg_attribute a;
````

```
 column_name   | data_type
---------------+------------------------
 id            | serial
 first-name    | text
 LastName      | text
 email         | text
 phone_number  | text
```

</Section>
<Section>
```ts
import * as p from "drizzle-orm/pg-core"

export const users = p.pgTable("users", {
id: p.serial(),
"first-name": p.text("first-name"),
LastName: p.text("LastName"),
email: p.text(),
phone_number: p.text("phone_number"),
});

````
```sql
SELECT a.attname AS column_name, format_type(a.atttypid, a.atttypmod) as data_type FROM pg_catalog.pg_attribute a;
````

```
 column_name   | data_type
---------------+------------------------
 id            | serial
 first-name    | text
 LastName      | text
 email         | text
 phone_number  | text
```

</Section>
</CodeTabs>

## ---

### `tablesFilter`

<Callout>
If you want to run multiple projects with one database - check out [our guide](/docs/goodies#multi-project-schema).
</Callout>
<rem025/>
`drizzle-kit push` and `drizzle-kit pull` will by default manage all tables in `public` schema.
You can configure list of tables, schemas and extensions via `tablesFilters`, `schemaFilter` and `extensionFilters` options.

`tablesFilter` option lets you specify [`glob`](https://www.digitalocean.com/community/tools/glob?comments=true&glob=/**/*.js&matches=false&tests=//%20This%20will%20match%20as%20it%20ends%20with%20'.js'&tests=/hello/world.js&tests=//%20This%20won't%20match!&tests=/test/some/globs)
based table names filter, e.g. `["users", "user_info"]` or `"user*"`

|          |                          |
| :------- | :----------------------- |
| type     | `string` `string[]`      |
| default  | --                       |
| commands | `generate` `push` `pull` |

<rem025/>
```ts
import { defineConfig } from "drizzle-kit";

export default defineConfig({
dialect: "postgresql",
tablesFilter: ["users", "posts", "project1_*"],
});

````

### `schemaFilter`
<Callout>
If you want to run multiple projects with one database - check out [our guide](/docs/goodies#multi-project-schema).
</Callout>

<rem025/>
`drizzle-kit push` and `drizzle-kit pull` will by default manage all tables in `public` schema.
You can configure list of tables, schemas and extensions via `tablesFilters`, `schemaFilter` and `extensionFilters` options.

`schemaFilter` option lets you specify list of schemas for Drizzle Kit to manage

|               |                      |
| :------------ | :-----------------   |
| type          | `string[]` |
| default       | `["public"]`                    |
| commands      | `generate` `push` `pull`   |

<rem025/>

```ts
export default defineConfig({
  dialect: "postgresql",
  schemaFilter: ["public", "schema1", "schema2"],
});
````

### `extensionsFilters`

<rem025/>

Some extensions like [`postgis`](https://postgis.net/), when installed on the database, create its own tables in public schema.
Those tables have to be ignored by `drizzle-kit push` or `drizzle-kit pull`.

`extensionsFilters` option lets you declare list of installed extensions for drizzle kit to ignore their tables in the schema.

|          |               |
| :------- | :------------ |
| type     | `["postgis"]` |
| default  | `[]`          |
| commands | `push` `pull` |

<rem025/>

```ts
export default defineConfig({
  dialect: 'postgresql',
  extensionsFilters: ['postgis'],
});
```

## ---

### `entities`

This configuration is created to set up management settings for specific `entities` in the database.

For now, it only includes `roles`, but eventually all database entities will migrate here, such as `tables`, `schemas`, `extensions`, `functions`, `triggers`, etc

#### `roles`

<rem025/>

If you are using Drizzle Kit to manage your schema and especially the defined roles, there may be situations where you have some roles that are not defined in the Drizzle schema.
In such cases, you may want Drizzle Kit to skip those `roles` without the need to write each role in your Drizzle schema and mark it with `.existing()`.

The `roles` option lets you:

- Enable or disable role management with Drizzle Kit.
- Exclude specific roles from management by Drizzle Kit.
- Include specific roles for management by Drizzle Kit.
- Enable modes for providers like `Neon` and `Supabase`, which do not manage their specific roles.
- Combine all the options above

|          |                                                                                      |
| :------- | :----------------------------------------------------------------------------------- |
| type     | `boolean \| { provider: "neon" \| "supabase", include: string[], exclude: string[]}` |
| default  | `false`                                                                              |
| commands | `push` `pull` `generate`                                                             |

<rem025/>

By default, `drizzle-kit` won't manage roles for you, so you will need to enable that. in `drizzle.config.ts`

```ts
export default defineConfig({
  dialect: "postgresql",
  extensionsFilters: entities: {
    roles: true
  }
});
```

**You have a role `admin` and want to exclude it from the list of manageable roles**

```ts
// drizzle.config.ts
import { defineConfig } from "drizzle-kit";

export default defineConfig({
  ...
  entities: {
    roles: {
      exclude: ['admin']
    }
  }
});
```

**You have a role `admin` and want to include to the list of manageable roles**

```ts
// drizzle.config.ts
import { defineConfig } from "drizzle-kit";

export default defineConfig({
  ...
  entities: {
    roles: {
      include: ['admin']
    }
  }
});
```

**If you are using `Neon` and want to exclude roles defined by `Neon`, you can use the provider option**

```ts
// drizzle.config.ts
import { defineConfig } from "drizzle-kit";

export default defineConfig({
  ...
  entities: {
    roles: {
      provider: 'neon'
    }
  }
});
```

**If you are using `Supabase` and want to exclude roles defined by `Supabase`, you can use the provider option**

```ts
// drizzle.config.ts
import { defineConfig } from "drizzle-kit";

export default defineConfig({
  ...
  entities: {
    roles: {
      provider: 'supabase'
    }
  }
});
```

<Callout title='important'>
You may encounter situations where Drizzle is slightly outdated compared to new roles specified by database providers, 
so you may need to use both the `provider` option and `exclude` additional roles. You can easily do this with Drizzle:

```ts
// drizzle.config.ts
import { defineConfig } from "drizzle-kit";

export default defineConfig({
  ...
  entities: {
    roles: {
      provider: 'supabase',
      exclude: ['new_supabase_role']
    }
  }
});
```

</Callout>

## ---

### `strict`

<rem025/>

Prompts confirmation to run printed SQL statements when running `drizzle-kit push` command.

|          |           |
| :------- | :-------- |
| type     | `boolean` |
| default  | `false`   |
| commands | `push`    |

<rem025/>

```ts
export default defineConfig({
  dialect: 'postgresql',
  breakpoints: false,
});
```

### `verbose`

<rem025/>

Print all SQL statements during `drizzle-kit push` command.

|          |                   |
| :------- | :---------------- |
| type     | `boolean`         |
| default  | `true`            |
| commands | `generate` `pull` |

<rem025/>

```ts
export default defineConfig({
  dialect: 'postgresql',
  breakpoints: false,
});
```

### `breakpoints`

<rem025/>

Drizzle Kit will automatically embed `--> statement-breakpoint` into generated SQL migration files,
that's necessary for databases that do not support multiple DDL alternation statements in one transaction(MySQL and SQLite).

`breakpoints` option flag lets you switch it on and off

|          |                   |
| :------- | :---------------- |
| type     | `boolean`         |
| default  | `true`            |
| commands | `generate` `pull` |

<rem025/>

```ts
export default defineConfig({
  dialect: 'postgresql',
  breakpoints: false,
});
```

import Tab from '@mdx/Tab.astro';
import Tabs from '@mdx/Tabs.astro';
import IsSupportedChipGroup from '@mdx/IsSupportedChipGroup.astro';
import Callout from '@mdx/Callout.astro';
import Section from '@mdx/Section.astro';

import CodeTab from '@mdx/CodeTab.astro';
import CodeTabs from '@mdx/CodeTabs.astro';

# Drizzle soft relations

The sole purpose of Drizzle relations is to let you query your relational data in the most simple and consise way:

<CodeTabs items={["Relational queries", "Select with joins"]}>

<Section>
```ts
import * as schema from './schema';
import { drizzle } from 'drizzle-orm/…';

const db = drizzle(client, { schema });

const result = db.query.users.findMany({
with: {
posts: true,
},
});

````
```ts
[{
  id: 10,
  name: "Dan",
  posts: [
    {
      id: 1,
      content: "SQL is awesome",
      authorId: 10,
    },
    {
      id: 2,
      content: "But check relational queries",
      authorId: 10,
    }
  ]
}]
````

</Section>
<Section>
```ts
import { drizzle } from 'drizzle-orm/…';
import { eq } from 'drizzle-orm';
import { posts, users } from './schema';

const db = drizzle(client);

const res = await db.select()
.from(users)
.leftJoin(posts, eq(posts.authorId, users.id))
.orderBy(users.id)
const mappedResult =

````
</Section>
</CodeTabs>


### One-to-one
Drizzle ORM provides you an API to define `one-to-one` relations between tables with the `relations` operator.

An example of a `one-to-one` relation between users and users, where a user can invite another (this example uses a self reference):

```typescript copy {10-15}
import { pgTable, serial, text, integer, boolean } from 'drizzle-orm/pg-core';
import { relations } from 'drizzle-orm';

export const users = pgTable('users', {
	id: serial('id').primaryKey(),
	name: text('name'),
	invitedBy: integer('invited_by'),
});

export const usersRelations = relations(users, ({ one }) => ({
	invitee: one(users, {
		fields: [users.invitedBy],
		references: [users.id],
	}),
}));
````

Another example would be a user having a profile information stored in separate table. In this case, because the foreign key is stored in the "profile_info" table, the user relation have neither fields or references. This tells Typescript that `user.profileInfo` is nullable:

```typescript copy {9-17}
import { pgTable, serial, text, integer, jsonb } from 'drizzle-orm/pg-core';
import { relations } from 'drizzle-orm';

export const users = pgTable('users', {
  id: serial('id').primaryKey(),
  name: text('name'),
});

export const usersRelations = relations(users, ({ one }) => ({
  profileInfo: one(profileInfo),
}));

export const profileInfo = pgTable('profile_info', {
  id: serial('id').primaryKey(),
  userId: integer('user_id').references(() => users.id),
  metadata: jsonb('metadata'),
});

export const profileInfoRelations = relations(profileInfo, ({ one }) => ({
  user: one(users, { fields: [profileInfo.userId], references: [users.id] }),
}));

const user = await queryUserWithProfileInfo();
//____^? type { id: number, profileInfo: { ... } | null  }
```

### One-to-many

Drizzle ORM provides you an API to define `one-to-many` relations between tables with `relations` operator.

Example of `one-to-many` relation between users and posts they've written:

```typescript copy {9-11, 19-24}
import { pgTable, serial, text, integer } from 'drizzle-orm/pg-core';
import { relations } from 'drizzle-orm';

export const users = pgTable('users', {
  id: serial('id').primaryKey(),
  name: text('name'),
});

export const usersRelations = relations(users, ({ many }) => ({
  posts: many(posts),
}));

export const posts = pgTable('posts', {
  id: serial('id').primaryKey(),
  content: text('content'),
  authorId: integer('author_id'),
});

export const postsRelations = relations(posts, ({ one }) => ({
  author: one(users, {
    fields: [posts.authorId],
    references: [users.id],
  }),
}));
```

Now lets add comments to the posts:

```typescript copy {14,17-22,24-29}
...

export const posts = pgTable('posts', {
	id: serial('id').primaryKey(),
	content: text('content'),
	authorId: integer('author_id'),
});

export const postsRelations = relations(posts, ({ one, many }) => ({
	author: one(users, {
		fields: [posts.authorId],
		references: [users.id],
	}),
	comments: many(comments)
}));

export const comments = pgTable('comments', {
	id: serial('id').primaryKey(),
	text: text('text'),
	authorId: integer('author_id'),
	postId: integer('post_id'),
});

export const commentsRelations = relations(comments, ({ one }) => ({
	post: one(posts, {
		fields: [comments.postId],
		references: [posts.id],
	}),
}));
```

### Many-to-many

Drizzle ORM provides you an API to define `many-to-many` relations between tables through so called `junction` or `join` tables,
they have to be explicitly defined and store associations between related tables.

Example of `many-to-many` relation between users and groups:

```typescript copy {9-11, 18-20, 37-46}
import { relations } from 'drizzle-orm';
import { integer, pgTable, primaryKey, serial, text } from 'drizzle-orm/pg-core';

export const users = pgTable('users', {
  id: serial('id').primaryKey(),
  name: text('name'),
});

export const usersRelations = relations(users, ({ many }) => ({
  usersToGroups: many(usersToGroups),
}));

export const groups = pgTable('groups', {
  id: serial('id').primaryKey(),
  name: text('name'),
});

export const groupsRelations = relations(groups, ({ many }) => ({
  usersToGroups: many(usersToGroups),
}));

export const usersToGroups = pgTable(
  'users_to_groups',
  {
    userId: integer('user_id')
      .notNull()
      .references(() => users.id),
    groupId: integer('group_id')
      .notNull()
      .references(() => groups.id),
  },
  (t) => ({
    pk: primaryKey({ columns: [t.userId, t.groupId] }),
  }),
);

export const usersToGroupsRelations = relations(usersToGroups, ({ one }) => ({
  group: one(groups, {
    fields: [usersToGroups.groupId],
    references: [groups.id],
  }),
  user: one(users, {
    fields: [usersToGroups.userId],
    references: [users.id],
  }),
}));
```

### Foreign keys

You might've noticed that `relations` look similar to foreign keys — they even have a `references` property. So what's the difference?

While foreign keys serve a similar purpose, defining relations between tables, they work on a different level compared to `relations`.

Foreign keys are a database level constraint, they are checked on every `insert`/`update`/`delete` operation and throw an error if a constraint is violated.
On the other hand, `relations` are a higher level abstraction, they are used to define relations between tables on the application level only.
They do not affect the database schema in any way and do not create foreign keys implicitly.

What this means is `relations` and foreign keys can be used together, but they are not dependent on each other.
You can define `relations` without using foreign keys (and vice versa), which allows them to be used with databases that do not support foreign keys.

The following two examples will work exactly the same in terms of querying the data using Drizzle relational queries.
<CodeTabs items={["schema1.ts", "schema2.ts"]}>
<CodeTab>

```ts {15}
export const users = pgTable('users', {
  id: serial('id').primaryKey(),
  name: text('name'),
});

export const usersRelations = relations(users, ({ one, many }) => ({
  profileInfo: one(users, {
    fields: [profileInfo.userId],
    references: [users.id],
  }),
}));

export const profileInfo = pgTable('profile_info', {
  id: serial('id').primaryKey(),
  userId: integer('user_id'),
  metadata: jsonb('metadata'),
});
```

</CodeTab>
<CodeTab>
```ts {15}
export const users = pgTable('users', {
	id: serial('id').primaryKey(),
	name: text('name'),
});

export const usersRelations = relations(users, ({ one, many }) => ({
profileInfo: one(users, {
fields: [profileInfo.userId],
references: [users.id],
}),
}));

export const profileInfo = pgTable('profile_info', {
id: serial('id').primaryKey(),
userId: integer("user_id").references(() => users.id),
metadata: jsonb("metadata"),
});

````
</CodeTab>
</CodeTabs>

### Foreign key actions

for more information check [postgres foreign keys docs](https://www.postgresql.org/docs/current/ddl-constraints.html#DDL-CONSTRAINTS-FK)

You can specify actions that should occur when the referenced data in the parent table is modified. These actions are known as "foreign key actions." PostgreSQL provides several options for these actions.

On Delete/ Update Actions

- `CASCADE`: When a row in the parent table is deleted, all corresponding rows in the child table will also be deleted. This ensures that no orphaned rows exist in the child table.

- `NO ACTION`: This is the default action. It prevents the deletion of a row in the parent table if there are related rows in the child table. The DELETE operation in the parent table will fail.

- `RESTRICT`: Similar to NO ACTION, it prevents the deletion of a parent row if there are dependent rows in the child table. It is essentially the same as NO ACTION and included for compatibility reasons.

- `SET DEFAULT`: If a row in the parent table is deleted, the foreign key column in the child table will be set to its default value if it has one. If it doesn't have a default value, the DELETE operation will fail.

- `SET NULL`: When a row in the parent table is deleted, the foreign key column in the child table will be set to NULL. This action assumes that the foreign key column in the child table allows NULL values.

> Analogous to ON DELETE there is also ON UPDATE which is invoked when a referenced column is changed (updated). The possible actions are the same, except that column lists cannot be specified for SET NULL and SET DEFAULT. In this case, CASCADE means that the updated values of the referenced column(s) should be copied into the referencing row(s).
in drizzle you can add foreign key action using `references()` second argument.

type of the actions

```typescript
export type UpdateDeleteAction = 'cascade' | 'restrict' | 'no action' | 'set null' | 'set default';

// second argument of references interface
actions?: {
		onUpdate?: UpdateDeleteAction;
		onDelete?: UpdateDeleteAction;
	} | undefined
````

In the following example, adding `onDelete: 'cascade'` to the author field on the `posts` schema means that deleting the `user` will also delete all related Post records.

```typescript {11}
import { pgTable, serial, text, integer } from 'drizzle-orm/pg-core';

export const users = pgTable('users', {
  id: serial('id').primaryKey(),
  name: text('name'),
});

export const posts = pgTable('posts', {
  id: serial('id').primaryKey(),
  name: text('name'),
  author: integer('author')
    .references(() => users.id, { onDelete: 'cascade' })
    .notNull(),
});
```

For constraints specified with the `foreignKey` operator, foreign key actions are defined with the syntax:

```typescript {18-19}
import { foreignKey, pgTable, serial, text, integer } from 'drizzle-orm/pg-core';

export const users = pgTable('users', {
  id: serial('id').primaryKey(),
  name: text('name'),
});

export const posts = pgTable(
  'posts',
  {
    id: serial('id').primaryKey(),
    name: text('name'),
    author: integer('author').notNull(),
  },
  (table) => ({
    fk: foreignKey({
      name: 'author_fk',
      columns: [table.author],
      foreignColumns: [users.id],
    })
      .onDelete('cascade')
      .onUpdate('cascade'),
  }),
);
```

### Disambiguating relations

Drizzle also provides the `relationName` option as a way to disambiguate
relations when you define multiple of them between the same two tables. For
example, if you define a `posts` table that has the `author` and `reviewer`
relations.

```ts {9-12, 21-32}
import { pgTable, serial, text, integer } from 'drizzle-orm/pg-core';
import { relations } from 'drizzle-orm';

export const users = pgTable('users', {
  id: serial('id').primaryKey(),
  name: text('name'),
});

export const usersRelations = relations(users, ({ many }) => ({
  author: many(posts, { relationName: 'author' }),
  reviewer: many(posts, { relationName: 'reviewer' }),
}));

export const posts = pgTable('posts', {
  id: serial('id').primaryKey(),
  content: text('content'),
  authorId: integer('author_id'),
  reviewerId: integer('reviewer_id'),
});

export const postsRelations = relations(posts, ({ one }) => ({
  author: one(users, {
    fields: [posts.authorId],
    references: [users.id],
    relationName: 'author',
  }),
  reviewer: one(users, {
    fields: [posts.reviewerId],
    references: [users.id],
    relationName: 'reviewer',
  }),
}));
```
