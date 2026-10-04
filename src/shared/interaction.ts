export interface DecisionChoice { id: string; label: string; description?: string; kind?: 'primary' | 'danger' }
export interface DecisionRequest {
  id: string; title: string; description: string; choices: DecisionChoice[];
  defaultChoice: string; cancelChoice: string; selection?: boolean; confirmLabel?: string;
}
