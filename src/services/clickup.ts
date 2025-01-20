import { ClickUpResponse, ClickUpTask } from "../interface/clickup/service";

class ClickupClient {
    private apiToken: string | null;
    private baseUrl: string = "https://api.clickup.com/api/v2";
    private listIdForCreate: string | null;
    private listIdForGet: string | null;

    constructor(baseUrl: string, apiToken: string, listIdForCreate: string, listIdForGet: string) {
        this.baseUrl = baseUrl;
        this.apiToken = apiToken;
        this.listIdForCreate = listIdForCreate;
        this.listIdForGet = listIdForGet;
    }

    async getTasks() : Promise<ClickUpResponse> {
        // TODO: Implement ClickUp API call
        const response = await fetch(`${this.baseUrl}/list/${this.listIdForGet}/task`,
        {
          method: 'GET',
          headers: {
            'Authorization': this.apiToken!,
            'Content-Type': 'application/json'
          },
        });

        if (!response.ok) {
            const errorText = await response.text();
            throw new Error(`ClickUp API error: ${response.status} - ${errorText}`);
          }
    
        const clickupTask = await response.json();
        return clickupTask;
    }

    async createTask(params: any) : Promise<ClickUpTask> {
        // TODO: Implement ClickUp API call
        const response = await fetch(`${this.baseUrl}/list/${this.listIdForCreate}/task`,
        {
          method: 'POST',
          headers: {
            'Authorization': this.apiToken!,
            'Content-Type': 'application/json'
          },
        });

        if (!response.ok) {
            const errorText = await response.text();
            throw new Error(`ClickUp API error: ${response.status} - ${errorText}`);
          }
    
        const clickupTask = await response.json();
        return clickupTask;
    }
}

export const clickupClient = new ClickupClient(process.env.CLICKUP_BASE_URL, process.env.CLICKUP_API_KEY, process.env.CLICKUP_LIST_ID_FOR_CREATE, process.env.CLICKUP_LIST_ID_FOR_GET);