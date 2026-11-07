import { getSetting } from './src/storage/settings';
import { callProvider } from './src/transport/api-clients/index';
import { buildCompilePrompt } from './src/lib/skill-compiler/prompt';
import { readSkill } from './src/skill-reader/index';

async function main(): Promise<void> {
  const skill = await readSkill('.shadowflow/cache/skill-ingest/9ac1ac635235');
  const prompt = buildCompilePrompt(skill);
  console.log('prompt estimated chars:', prompt.estimated_chars);
  console.log('user prompt length:', prompt.user.length);

  const byok = getSetting('byok') as any;
  const apiKey = byok?.providers?.zhipu?.apiKey;
  const baseUrl = byok?.providers?.zhipu?.baseUrl;
  console.log('zhipu key prefix:', apiKey?.slice(0, 12));

  console.log('Calling zhipu glm-4.6 with max_tokens=4096...');
  const stream = callProvider('zhipu', {
    systemPrompt: prompt.system,
    userMessage: prompt.user,
    api_key: apiKey,
    base_url: baseUrl,
    model: 'glm-4.6',
    max_tokens: 4096,
    temperature: 0,
  });
  let text = '';
  let errored = false;
  for await (const c of stream) {
    if (c.type === 'text-delta') text += c.text;
    else if (c.type === 'error') {
      errored = true;
      console.log('ERROR CHUNK:', c.code, c.message);
    }
  }
  console.log('errored:', errored);
  console.log('text length:', text.length);
  console.log('text preview (first 300):', text.slice(0, 300));
  console.log('text tail (last 300):', text.slice(-300));
}
main().catch(e => { console.error(e); process.exit(1); });
