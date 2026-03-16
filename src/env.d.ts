/// <reference types="@astrojs/cloudflare" />

declare namespace App {
  interface Locals {
    runtime: import('@astrojs/cloudflare').Runtime<Env>;
  }
}

interface Env {
  BUCKET: import('@cloudflare/workers-types').R2Bucket;
  DB: import('@cloudflare/workers-types').D1Database;
}
