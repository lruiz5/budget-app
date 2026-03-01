import { Hono } from 'hono';
import type { AppEnv } from '../types';
declare const route: Hono<AppEnv, import("hono/types").BlankSchema, "/">;
export default route;
