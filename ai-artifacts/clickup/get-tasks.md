## ClickUp API Documentation in Markdown Format

### Get Tasks API

The **Get Tasks** API allows you to view the tasks in a specific list. The responses are limited to 100 tasks per page, and you can only access task information for tasks you have permission to view.

#### Endpoint
```
GET https://api.clickup.com/api/v2/list/{list_id}/task
```

#### Parameters
- **list_id**: The ID of the list from which to fetch tasks (required).
- **archived**: Boolean value to specify if archived tasks should be included (optional, default is false).
- **page**: The page number to fetch (starts at 0, optional).
- **order_by**: Field to order the results by (options: id, created, updated, due_date; optional).
- **reverse**: Boolean value to reverse the order of results (optional).
- Additional query parameters can be included as needed.

#### Example Request
```http
GET https://api.clickup.com/api/v2/list/123/task?archived=false&page=0&order_by=created
```

#### Response
The response will include a list of tasks with details such as task ID, name, status, priority, and other relevant fields.

---

### Create Task API

The **Create Task** API allows you to create a new task within a specified list.

#### Endpoint
```
POST https://api.clickup.com/api/v2/list/{list_id}/task
```

#### Request Body
The request body should include the following fields:
- **name**: The name of the task (required).
- **description**: A detailed description of the task (optional).
- **assignees**: An array of user IDs assigned to the task (optional).
- **status**: The current status of the task (optional).
- **priority**: The priority level of the task (optional).
- Additional fields can be included based on your requirements.

#### Example Request
```json
{
  "name": "New Task",
  "description": "Description of the new task",
  "assignees": [12345],
  "status": "to do",
  "priority": "high"
}
```

#### Response
The response will include details about the created task, including its ID and status.

---

### Creating a Task from ClickUp Docs

To create a task directly from a ClickUp Doc:
1. Highlight the text you want to turn into a task.
2. Select the `+task` option from the text toolbar.
3. This action will automatically link the Doc as a relationship within the new task.

You can also create a task from any location in your Workspace by clicking the `+task` button located at the bottom-right corner.

---

This Markdown format provides a structured overview of the ClickUp API's Get Tasks and Create Task functionalities, along with instructions for creating tasks from ClickUp Docs.

Citations:
[1] https://www.upsys-consulting.com/en/blog-en/how-to-make-use-of-the-clickup-api-features-examples
[2] https://www.reddit.com/r/clickup/comments/zh3s8y/create_a_new_task_from_a_docpage/
[3] https://help.clickup.com/hc/en-us/articles/6303426241687-Use-the-ClickUp-API
[4] https://github.com/psolymos/clickrup/blob/master/R/api-tasks.R
[5] https://developer.clickup.com/reference/gettasks
[6] https://community.make.com/t/how-to-create-a-clickup-doc-when-a-task-is-created/14031
[7] https://developer.clickup.com/reference/gettask
[8] https://help.clickup.com/hc/en-us/articles/6328174371351-Intro-to-Docs
[9] https://community.make.com/t/getting-markdown-descriptions-from-clickup/24909