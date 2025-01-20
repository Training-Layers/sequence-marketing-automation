declare global {
    namespace NodeJS {
      interface ProcessEnv {
        CLAY_WEBHOOK_URL: string;
        CLICKUP_BASE_URL: string;
        CLICKUP_API_KEY: string;
        CLICKUP_LIST_ID_FOR_CREATE: string;
        CLICKUP_LIST_ID_FOR_GET: string;
        SEQUENCE_SUPABASE_SERVICE_KEY: string;
        MARKETING_SUPABASE_API_URL: string;
        SEQUENCE_SUPABASE_API_URL: string;
        MARKETING_SUPABASE_SERVICE_KEY: string;
        TRIGGER_API_KEY: string;
        TRIGGER_SECRET_KEY: string;
        DATABASE_URL: string;
      }
    }
  }
  
  export {};
  