import { callProvider } from './src/transport/api-clients/index';
import { getSetting } from './src/storage/settings';

async function main(): Promise<void> {
  const byok = getSetting('byok') as any;
  console.log('zhipu key:', byok?.providers?.zhipu?.apiKey?.slice(0, 12) + '…');
  console.log('zhipu baseUrl:', byok?.providers?.zhipu?.baseUrl);
  const stream = callProvider('zhipu', {
    systemPrompt: 'You are a helpful assistant. Respond with only JSON.',
    userMessage: 'Output: {"hello":"world"}',
    api_key: byok?.providers?.zhipu?.apiKey,
    base_url: byok?.providers?.zhipu?.baseUrl,
    model: 'glm-4.6',
    max_tokens: 200,
    temperature: 0,
  });
  for await (const c of stream) {
    console.log('CHUNK:', JSON.stringify(c));
  }
}
main().catch(e => { console.error(e); process.exit(1); });
