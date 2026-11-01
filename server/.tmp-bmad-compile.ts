// Real-LLM BMAD compile smoke. Run from server/ via:
//   npx tsx .tmp-bmad-compile.ts
//
// Reads PR-A cached BMAD content, runs compile() against the configured
// BYOK provider (zhipu key is in settings.json on this dev box), prints
// the compiled skill summary. Second run validates cache hit < 50ms.

import { readSkill } from './src/skill-reader/index';
import { compile } from './src/lib/skill-compiler/index';

const BMAD = '.shadowflow/cache/skill-ingest/9ac1ac635235';

async function main(): Promise<void> {
  const skill = await readSkill(BMAD);
  console.log(`\n[read] skill_id=${skill.skill_id} agent_files=${skill.agent_files.length} hash=${skill.content_hash.slice(0,12)}...`);

  console.log('\n[compile 1] (real LLM)...');
  const t0 = Date.now();
  const compiled1 = await compile(skill);
  const dur1 = Date.now() - t0;
  console.log(JSON.stringify({
    mode: compiled1.mode,
    members: compiled1.teamConfig?.members_ids?.length ?? null,
    edges: compiled1.teamConfig?.edges_v1?.length ?? null,
    agent_tools: compiled1.agentConfig?.tools?.length ?? null,
    derivedFrom: compiled1.teamConfig?.derivedFrom ?? 'n/a',
    llm_model: compiled1.llm_call_meta.model,
    llm_tokens: compiled1.llm_call_meta.tokens_in + compiled1.llm_call_meta.tokens_out,
    duration_ms: dur1,
  }, null, 2));

  console.log('\n[compile 2] (expect cache hit)...');
  const t1 = Date.now();
  const compiled2 = await compile(skill);
  const dur2 = Date.now() - t1;
  console.log(JSON.stringify({
    mode: compiled2.mode,
    cache_hit: dur2 < 50,
    duration_ms: dur2,
  }, null, 2));
}

main().catch((err) => {
  console.error(err);
  process.exit(1);
});
