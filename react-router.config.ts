import type { Config } from "@react-router/dev/config";

export default {
  // Config options...
  // Server-side render by default, to enable SPA mode set this to `false`
  ssr: true,
  // Keep v7 behavior until the v8 changes have been tested.
  future: {
    v8_middleware: false,
    v8_splitRouteModules: false,
    v8_viteEnvironmentApi: false,
    v8_passThroughRequests: false,
    v8_trailingSlashAwareDataRequests: false,
  },
} satisfies Config;
