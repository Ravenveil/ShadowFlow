import { useEffect } from 'react';
import { PolicyMatrixPanel } from '../Panel/PolicyMatrixPanel';
import { usePolicyStore } from '../../hooks/usePolicyStore';
import type { PolicyMatrix } from '../../hooks/usePolicyStore';
import type { AgentRecord } from '../../../api/agents';
import type { TeamRecord } from '../../../api/teams';
import { getTeamPolicy, putTeamPolicy } from '../../../api/teams';

interface TeamPolicyPanelProps {
  team: TeamRecord;
  memberAgents: AgentRecord[];
}

export function TeamPolicyPanel({ team, memberAgents }: TeamPolicyPanelProps) {
  const setAgents = usePolicyStore((s) => s.setAgents);
  const setMatrix = usePolicyStore((s) => s.setMatrix);

  useEffect(() => {
    const names = memberAgents.map((a) => a.name);
    setAgents(names);
  }, [memberAgents, setAgents]);

  useEffect(() => {
    getTeamPolicy(team.team_id).then((raw) => {
      if (Object.keys(raw).length > 0) {
        const names = memberAgents.map((a) => a.name);
        const typed = raw as PolicyMatrix;
        setMatrix(typed, names);
      }
    });
  }, [team.team_id, memberAgents, setMatrix]);

  const handleSave = async (matrix: PolicyMatrix) => {
    const serialized: Record<string, Record<string, string>> = {};
    for (const [sender, row] of Object.entries(matrix)) {
      serialized[sender] = {};
      for (const [receiver, state] of Object.entries(row)) {
        serialized[sender][receiver] = state;
      }
    }
    await putTeamPolicy(team.team_id, serialized);
  };

  return (
    <div data-testid="team-policy-panel">
      <PolicyMatrixPanel onSave={handleSave} />
    </div>
  );
}
