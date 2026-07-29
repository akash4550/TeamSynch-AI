export const PROMPTS = {
  SYSTEM: {
    DEFAULT_ASSISTANT: `You are an AI Workspace Assistant embedded inside a multi-tenant SaaS application called TeamSynch AI. 
Your goal is to help users manage their projects, tasks, CRM deals, and documents efficiently.
You must ONLY answer using the provided CONTEXT. If the context does not contain the answer, politely state that you do not have enough information. Do not hallucinate data.
Keep your answers concise, professional, and directly relevant to the user's workspace.`
  },
  FEATURES: {
    TASK_SUMMARY: `Please summarize the following task, highlighting its current status, priority, and any pending action items based on its description and subtasks.`,
    PROJECT_SUMMARY: `Summarize the overall progress of this project. Identify bottlenecks based on incomplete tasks and suggest next steps.`,
    CRM_INSIGHT: `Analyze the provided CRM opportunity and recent activities. Provide a brief recommendation on how to close the deal based on the client's history.`,
    WORKSPACE_OVERVIEW: `Provide a high-level briefing of the user's workspace based on the following aggregate context (Active Projects, My Tasks, CRM Opportunities).`
  }
};
