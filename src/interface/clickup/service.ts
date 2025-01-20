// Main response interface
export interface ClickUpResponse {
    tasks: Task[];
    last_page: boolean;
}

export interface ClickUpTask {
    id: string;
    custom_id: null | string;
    custom_item_id: number;
    name: string;
    text_content: string;
    description: string;
    status: {
        id: string;
        status: 'to do' | 'in progress' | 'complete' | string;
        color: string;
        orderindex: number;
        type: string;
    };
    orderindex: string;
    date_created: string;
    date_updated: string;
    date_closed: string | null;
    date_done: string | null;
    archived: boolean;
    creator: {
        id: number;
        username: string;
        color: string;
        email: string;
        profilePicture: string;
    };
    assignees: Array<User>;
    group_assignees: Array<any>;
    watchers: Array<User & {
        initials: string;
    }>;
    checklists: Array<any>;
    tags: Array<any>;
    parent: null | string;
    top_level_parent: null | string;
    priority: null | {
        color: string;
        id: string;
        orderindex: string;
        priority: string;
    };
    due_date: string | null;
    start_date: string | null;
    points: number | null;
    time_estimate: number | null;
    time_spent: number;
    custom_fields: Array<any>;
    dependencies: Array<any>;
    linked_tasks: Array<any>;
    locations: Array<any>;
    team_id: string;
    url: string;
    sharing: {
        public: boolean;
        public_share_expires_on: null | string;
        public_fields: Array<string>;
        token: null | string;
        seo_optimized: boolean;
    };
    permission_level: 'create' | 'edit' | 'view' | string;
    list: {
        id: string;
        name: string;
        access: boolean;
    };
    project: {
        id: string;
        name: string;
        hidden: boolean;
        access: boolean;
    };
    folder: {
        id: string;
        name: string;
        hidden: boolean;
        access: boolean;
    };
    space: {
        id: string;
    };
}

// Task interface
export interface Task {
    id: string;
    custom_id: string | null;
    custom_item_id: number;
    name: string;
    text_content: string;
    description: string;
    status: Status;
    orderindex: string;
    date_created: string;
    date_updated: string;
    date_closed: string | null;
    date_done: string | null;
    archived: boolean;
    creator: User;
    assignees: User[];
    group_assignees: GroupAssignee[];
    watchers: User[];
    checklists: Checklist[];
    tags: Tag[];
    parent: null;
    top_level_parent: null;
    priority: Priority | null;
    due_date: string | null;
    start_date: string | null;
    points: number | null;
    time_estimate: number | null;
    custom_fields: any[];
    dependencies: any[];
    linked_tasks: LinkedTask[];
    locations: any[];
    team_id: string;
    url: string;
    sharing: Sharing;
    permission_level: string;
    list: List;
    project: Project;
    folder: Folder;
    space: Space;
}

// Status interface
export interface Status {
    status: string;
    id: string;
    color: string;
    type: string;
    orderindex: number;
}

// User interface
export interface User {
    id: number;
    username: string;
    color: string;
    email: string;
    profilePicture?: string;
    initials?: string;
}

// Group Assignee interface
export interface GroupAssignee {
    id: string;
    name: string;
    color: string;
    initials: string;
    email: string;
}

// Checklist interface
export interface Checklist {
    id: string;
    task_id: string;
    name: string;
    date_created: string;
    orderindex: number;
    creator: number;
    resolved: number;
    unresolved: number;
    items: ChecklistItem[];
}

// Checklist Item interface
export interface ChecklistItem {
    id: string;
    name: string;
    orderindex: number;
    assignee: User | null;
    group_assignee: GroupAssignee | null;
    resolved: boolean;
    parent: null;
    date_created: string;
    start_date: string | null;
    start_date_time: boolean;
    due_date: string | null;
    due_date_time: boolean;
    sent_due_date_notif: null;
    children: any[];
}

// Tag interface
export interface Tag {
    name: string;
    tag_fg: string;
    tag_bg: string;
    creator: number;
}

// Priority interface
export interface Priority {
    color: string;
    id: string;
    orderindex: string;
    priority: string;
}

// Linked Task interface
export interface LinkedTask {
    task_id: string;
    link_id: string;
    date_created: string;
    userid: string;
    workspace_id: string;
}

// Sharing interface
export interface Sharing {
    public: boolean;
    public_share_expires_on: string | null;
    public_fields: string[];
    token: string | null;
    seo_optimized: boolean;
}

// List interface
export interface List {
    id: string;
    name: string;
    access: boolean;
}

// Project interface
export interface Project {
    id: string;
    name: string;
    hidden: boolean;
    access: boolean;
}

// Folder interface
export interface Folder {
    id: string;
    name: string;
    hidden: boolean;
    access: boolean;
}

// Space interface
export interface Space {
    id: string;
}

// Helper type for task status
export type TaskStatus = 'to do' | 'in progress' | 'complete' | 'closed';

// Helper type for task priority
export type TaskPriority = 'urgent' | 'high' | 'normal' | 'low';

// Helper union type for possible permission levels
export type PermissionLevel = 'create' | 'view' | 'edit' | 'delete' | 'admin';