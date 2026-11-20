export default async function handler(req, res) {
  res.setHeader('Access-Control-Allow-Methods','POST, OPTIONS');
  res.setHeader('Access-Control-Allow-Headers','Content-Type');
  if(req.method==='OPTIONS') return res.status(204).end();
  if(req.method!=='POST') return res.status(405).json({error:'Método no permitido.'});
  try {
    const key=process.env.GEMINI_API_KEY;
    if(!key) return res.status(500).json({error:'Falta configurar GEMINI_API_KEY en Vercel.'});
    const {imageBase64,mimeType,platform,tone,context,previous,regenerate,systemInstruction}=req.body||{};
    if(!imageBase64||!mimeType) return res.status(400).json({error:'No recibí la imagen. Adjunta una fotografía.'});
    if(!['image/jpeg','image/png','image/webp'].includes(mimeType)) return res.status(400).json({error:'Formato de imagen no admitido.'});
    if(imageBase64.length>11_500_000) return res.status(413).json({error:'La imagen es demasiado grande. Prueba con una imagen menor de 8 MB.'});
    const rules={
      INSTAGRAM:'Instagram: inicio atractivo, párrafos breves y lectura visual fluida.',
      FACEBOOK:'Facebook: tono conversacional, identificación, contexto y conversación.',
      TIKTOK:'TikTok: inicio directo, ritmo ágil y explicación concisa.'
    };
    const prompt=`Crea un caption en español para ${platform||'INSTAGRAM'}. ${rules[platform]||rules.INSTAGRAM}
Tono elegido: ${tone||'Cercano y conversacional'}.
Contexto adicional: ${context||'No indicado; elige un enfoque pertinente según la imagen.'}
${regenerate?'Genera un ángulo y una estructura diferentes a los anteriores.':''}
Evita repetir estos captions previos: ${(Array.isArray(previous)?previous.slice(-3):[]).join('\n---\n')||'Ninguno'}.
Analiza la fotografía y redacta un caption útil y natural. Devuelve exclusivamente JSON con visualAnalysisSummary (máximo 18 palabras), captionBody (texto con párrafos, emojis moderados, sin hashtags) y hashtags (array de exactamente cinco hashtags).`;
    const response=await fetch('https://generativelanguage.googleapis.com/v1beta/models/gemini-2.5-flash:generateContent?key='+encodeURIComponent(key),{
      method:'POST',headers:{'Content-Type':'application/json'},
      body:JSON.stringify({
        systemInstruction:{parts:[{text:systemInstruction||'Eres un copywriter experto en belleza y automaquillaje.'}]},
        contents:[{role:'user',parts:[{text:prompt},{inlineData:{mimeType,data:imageBase64}}]}],
        generationConfig:{temperature:regenerate?0.9:0.75,responseMimeType:'application/json',
          responseSchema:{type:'OBJECT',properties:{visualAnalysisSummary:{type:'STRING'},captionBody:{type:'STRING'},hashtags:{type:'ARRAY',items:{type:'STRING'}}},required:['visualAnalysisSummary','captionBody','hashtags']}}
      })
    });
    const body=await response.json().catch(()=>({}));
    if(!response.ok){const msg=body?.error?.message||`Gemini devolvió ${response.status}`;return res.status(response.status===429?429:502).json({error:`Gemini: ${msg}`});}
    const raw=body?.candidates?.[0]?.content?.parts?.find(p=>p.text)?.text;
    if(!raw)return res.status(502).json({error:'Gemini no devolvió contenido. Comprueba la cuota de tu API.'});
    let result;try{result=JSON.parse(raw)}catch{return res.status(502).json({error:'No se pudo interpretar la respuesta de Gemini.'})}
    return res.status(200).json({result});
  }catch(err){console.error(err);return res.status(500).json({error:'Error interno al procesar la imagen.'})}
}