const MAKE_WEBHOOK = 'https://hook.us2.make.com/5a7d3qasogc6nbcj6dw01gvoe6tn1jb4';

const SYSTEM_PROMPT = `You are the receptionist for Spartan Builders, a premium design-build general contractor in the GTA with 18+ years experience. You are knowledgeable, confident, and human in tone.

BRAND VOICE: Direct and warm. No filler phrases. Maximum 3 sentences per message. No emojis. Plain Canadian English. Never quote prices. Never make promises about timelines.

YOUR JOB: Qualify leads naturally. Uncover project type, location (GTA only), timeline, and who they are. Always collect name and phone before ending conversation.

CLOSING: Hot lead (GTA + project + within 90 days): "I'd love to get Baz out to see the space — can I get your name and best number?" Warm lead: "Can I get your name and number so our team can follow up?"

SPARTAN BUILDERS FACTS:
- Services: full renovation, kitchen, bathroom, basement, additions, commercial, design-build, pre-listing
- Differentiator: ClearScope — fully itemized scope before work starts, no surprise change orders
- Service area: Toronto, Mississauga, Brampton, Vaughan, Markham, Richmond Hill, Oakville, Burlington, Hamilton, Etobicoke, Scarborough, North York, Ajax, Whitby, Pickering
- Phone: 437-436-4977 | Email: info@spartanbuilders.ca | 4.9 Google stars
- Owner: Baz Para, 18+ years GTA construction`;

const EXTRACT_PROMPT = `Analyze this conversation and extract contact info. Return ONLY valid JSON, nothing else:
{"name":"full name or empty","phone":"phone number or empty","email":"email or empty","contact_type":"Client Lead","project_type":"kitchen/bathroom/basement/full_reno/addition/commercial/other or empty","lead_type":"homeowner/agent/property_manager/commercial/developer or empty","location":"city or empty","timeline":"hot/warm/cold","status":"booked/nurture/new","appointment_date":"date if mentioned or empty","disqualification_reason":"empty","notes":"one sentence summary max 200 chars"}
Definitions: hot=within 90 days, warm=90+ days, cold=browsing. booked=confirmed visit date.`;

async function extractAndSend(messages, apiKey) {
  try {
    const convo = messages.map(m => `${m.role === 'user' ? 'Visitor' : 'Spartan'}: ${m.content}`).join('\n');
    const r = await fetch('https://api.anthropic.com/v1/messages', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json', 'x-api-key': apiKey, 'anthropic-version': '2023-06-01' },
      body: JSON.stringify({
        model: 'claude-haiku-4-5-20251001',
        max_tokens: 400,
        messages: [{ role: 'user', content: EXTRACT_PROMPT + '\n\nConversation:\n' + convo }]
      })
    });
    const d = await r.json();
    const text = d.content[0].text.trim();
    const match = text.match(/\{[\s\S]*\}/);
    if (!match) return;
    const data = JSON.parse(match[0]);
    if (!data.name && !data.phone) return;
    await fetch(MAKE_WEBHOOK, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({
        name: data.name || '', phone: data.phone || '', email: data.email || '',
        contact_type: 'Client Lead', source: 'Website Chatbot',
        project_type: data.project_type || '', lead_type: data.lead_type || '',
        location: data.location || '', timeline: data.timeline || 'warm',
        status: data.status || 'new', appointment_date: data.appointment_date || '',
        disqualification_reason: '', notes: data.notes || ''
      })
    });
    console.log('Sent to Make:', data.name, data.phone);
  } catch (e) {
    console.error('Extract/send failed:', e.message);
  }
}

exports.handler = async function(event) {
  const headers = {
    'Access-Control-Allow-Origin': '*',
    'Access-Control-Allow-Headers': 'Content-Type',
    'Access-Control-Allow-Methods': 'POST, OPTIONS',
    'Content-Type': 'application/json'
  };
  if (event.httpMethod === 'OPTIONS') return { statusCode: 200, headers, body: '' };
  try {
    const { messages } = JSON.parse(event.body);
    const apiKey = process.env.ANTHROPIC_API_KEY;
    const r = await fetch('https://api.anthropic.com/v1/messages', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json', 'x-api-key': apiKey, 'anthropic-version': '2023-06-01' },
      body: JSON.stringify({ model: 'claude-sonnet-4-6', max_tokens: 1024, system: SYSTEM_PROMPT, messages })
    });
    const data = await r.json();
    const fullText = messages.map(m => m.content).join(' ');
    if (/\d{3}[\s.-]?\d{3}[\s.-]?\d{4}/.test(fullText) && messages.length >= 4) {
      extractAndSend(messages, apiKey);
    }
    return { statusCode: 200, headers, body: JSON.stringify(data) };
  } catch (e) {
    return { statusCode: 500, headers, body: JSON.stringify({ error: e.message }) };
  }
};
