/** UI facts projected from authorized task records, never inferred from chat text. */
export type WorkflowStage = 'accept' | 'work' | 'review' | 'done' | 'cancelled' | 'restricted';
export interface WorkflowTaskView {
  id: string;
  title: string;
  status: string;
  stage: WorkflowStage;
  goal: string;
  acceptanceCriteria: string;
  assignees: string[];
  nextStep: string;
  actionLabel: string;
  href: string;
  latestDelivery?: { revision: number; status: string; summary: string };
  runStatus?: string;
}
export interface ConversationWorkflowView {
  joinedMembers: number;
  invitedMembers: number;
  totalTasks: number;
  completedTasks: number;
  restrictedTasks: number;
  tasks: WorkflowTaskView[];
}
