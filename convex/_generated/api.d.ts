/* eslint-disable */
/**
 * Generated `api` utility.
 *
 * THIS CODE IS AUTOMATICALLY GENERATED.
 *
 * To regenerate, run `npx convex dev`.
 * @module
 */

import type * as accounts from "../accounts.js";
import type * as analytics from "../analytics.js";
import type * as apiKeys from "../apiKeys.js";
import type * as auth from "../auth.js";
import type * as billing from "../billing.js";
import type * as explore from "../explore.js";
import type * as media from "../media.js";
import type * as model from "../model.js";
import type * as posts from "../posts.js";
import type * as publish from "../publish.js";
import type * as queue from "../queue.js";
import type * as records from "../records.js";
import type * as studioJobs from "../studioJobs.js";
import type * as supportChat from "../supportChat.js";
import type * as teams from "../teams.js";
import type * as trendRecreations from "../trendRecreations.js";
import type * as users from "../users.js";
import type * as workspaces from "../workspaces.js";

import type {
  ApiFromModules,
  FilterApi,
  FunctionReference,
} from "convex/server";

declare const fullApi: ApiFromModules<{
  accounts: typeof accounts;
  analytics: typeof analytics;
  apiKeys: typeof apiKeys;
  auth: typeof auth;
  billing: typeof billing;
  explore: typeof explore;
  media: typeof media;
  model: typeof model;
  posts: typeof posts;
  publish: typeof publish;
  queue: typeof queue;
  records: typeof records;
  studioJobs: typeof studioJobs;
  supportChat: typeof supportChat;
  teams: typeof teams;
  trendRecreations: typeof trendRecreations;
  users: typeof users;
  workspaces: typeof workspaces;
}>;

/**
 * A utility for referencing Convex functions in your app's public API.
 *
 * Usage:
 * ```js
 * const myFunctionReference = api.myModule.myFunction;
 * ```
 */
export declare const api: FilterApi<
  typeof fullApi,
  FunctionReference<any, "public">
>;

/**
 * A utility for referencing Convex functions in your app's internal API.
 *
 * Usage:
 * ```js
 * const myFunctionReference = internal.myModule.myFunction;
 * ```
 */
export declare const internal: FilterApi<
  typeof fullApi,
  FunctionReference<any, "internal">
>;

export declare const components: {};
