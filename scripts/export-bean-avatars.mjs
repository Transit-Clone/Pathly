/** Rebuild the standalone preview and SVG kit from the app's single artwork source. */
import fs from 'node:fs/promises';
import path from 'node:path';
import { fileURLToPath } from 'node:url';
import ts from 'typescript';

const root = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '..');
const source = await fs.readFile(path.join(root, 'mobile/src/avatars/beanAvatar.ts'), 'utf8');
const js = ts.transpileModule(source, { compilerOptions: { target: ts.ScriptTarget.ES2022, module: ts.ModuleKind.ES2022 } }).outputText;
const kit = await import(`data:text/javascript;base64,${Buffer.from(js).toString('base64')}`);
const hatSource = await fs.readFile(path.join(root, 'mobile/src/avatars/beanHatPreview.ts'), 'utf8');
const hatJs = ts.transpileModule(hatSource, { compilerOptions: { target: ts.ScriptTarget.ES2022, module: ts.ModuleKind.ES2022 } }).outputText.replace(/^import .*;\r?\n/gm, '');
const output = path.join(root, 'mobile/assets/bean-avatars');
await fs.mkdir(output, { recursive: true });
for (const preset of kit.BEAN_PRESETS) {
  await fs.writeFile(path.join(output, `${preset.id}.svg`), kit.beanAvatarSvg(preset.config));
}
for (const [category, parts] of [['eyes', kit.BEAN_EYES], ['mouths', kit.BEAN_MOUTHS], ['hair', kit.BEAN_HAIR]]) {
  const folder = path.join(output, 'parts', category);
  await fs.mkdir(folder, { recursive: true });
  for (const part of parts) {
    await fs.writeFile(path.join(folder, `${part.id}.svg`), `<svg xmlns="http://www.w3.org/2000/svg" width="128" height="128" viewBox="0 0 128 128">${part.svg}</svg>`);
  }
}
await fs.writeFile(path.join(output, 'body.svg'), `<svg xmlns="http://www.w3.org/2000/svg" width="128" height="128" viewBox="0 0 128 128"><path d="${kit.BEAN_BODY_PATH}" fill="${kit.BEAN_COLORS[0].hex}"/></svg>`);
await fs.writeFile(path.join(output, 'presets.json'), JSON.stringify(kit.BEAN_PRESETS, null, 2) + '\n');
const html = `<!doctype html>
<html lang="en"><meta charset="utf-8"><meta name="viewport" content="width=device-width,initial-scale=1">
<title>Pathly bean avatar studio</title>
<style>
:root{font-family:ui-rounded,system-ui,sans-serif;color:#242728;background:#f7f6f2;color-scheme:light}*{box-sizing:border-box}body{margin:0}main{max-width:1120px;margin:auto;padding:40px 24px}h1{font-size:34px;letter-spacing:-1px;margin:4px 0 10px}p{line-height:1.5;color:#565b58}.eyebrow{font-size:12px;letter-spacing:2px;font-weight:750;color:#547b53}.layout{display:grid;grid-template-columns:320px 1fr;gap:28px;margin:28px 0}.panel{padding:24px;border-radius:24px;background:white;border:1px solid #e1e4dc}.preview{text-align:center;position:sticky;top:24px;align-self:start}#hero svg{width:220px;height:220px}.sizes{display:flex;align-items:center;justify-content:center;gap:20px;min-height:90px}.sample{display:flex;flex-direction:column;align-items:center;gap:6px;font-size:11px;color:#656962}.sample svg{display:block}.dark{background:#202826;border-radius:14px;padding:10px;display:flex;justify-content:center;gap:16px}.dark svg{width:40px;height:40px}button{font:inherit;cursor:pointer;border:1px solid #dde1d9;border-radius:12px;background:#fff;color:#242728;min-height:44px}button:focus-visible{outline:3px solid #347c61;outline-offset:3px}button[aria-pressed="true"]{border:2px solid #34664d;background:#edf4eb}h2{font-size:17px;margin:0 0 14px}section+section{margin-top:26px}.options{display:grid;grid-template-columns:repeat(6,minmax(0,1fr));gap:8px}.option{padding:5px 2px 8px;font-size:10px;line-height:1.15;min-width:0}.option svg{display:block;width:58px;height:58px;margin:auto}.swatches{display:grid;grid-template-columns:repeat(6,1fr);gap:8px}.swatch{padding:7px 2px;font-size:10px}.swatch span{display:block;margin:0 auto 5px;width:28px;height:28px;border-radius:50%;border:1px solid #0001}.actions{display:grid;gap:10px;margin-top:22px}.primary{background:#315d45;color:white;padding:10px 14px;border:0}.secondary{padding:10px 14px}.preset-grid{display:grid;grid-template-columns:repeat(6,1fr);gap:10px}.preset{padding:12px 6px;font-size:12px}.preset svg{width:100%;max-width:112px;display:block;margin:auto}.note{font-size:12px}.status{min-height:20px;font-size:12px;color:#315d45}footer{margin:24px 0;font-size:12px;color:#656962}@media(max-width:760px){main{padding:24px 14px}.layout{grid-template-columns:1fr}.preview{position:static}.options{grid-template-columns:repeat(4,1fr)}.preset-grid{grid-template-columns:repeat(3,1fr)}#hero svg{height:160px;width:160px}}
#hero{animation:bean-idle 3s ease-in-out infinite;transform-origin:50% 65%}
@keyframes bean-idle{0%,100%{transform:translateY(0) rotate(-1.5deg)}50%{transform:translateY(-5.5px) rotate(1.5deg)}}
@media(prefers-reduced-motion:reduce){#hero{animation:none}}
#shuffle{min-height:44px;padding:10px 20px;border-radius:22px;margin:auto}
:root{--page:#F7FAFF;--surface:#FFFFFF;--ink:#1F2937;--muted:#657386;--border:#DCE7F2;--blue:#0B4F9C;--on-blue:#FFFFFF;--soft:#E6F3FF;background:var(--page);color:var(--ink);color-scheme:light dark}
.panel,button{background:var(--surface);color:var(--ink);border-color:var(--border)}p,.note,footer,.sample{color:var(--muted)}.primary{background:var(--blue);color:var(--on-blue)}button[aria-pressed="true"]{border-color:var(--blue);background:var(--soft)}button:focus-visible{outline-color:var(--blue)}.status{color:var(--blue)}
@media(prefers-color-scheme:dark){:root{--page:#000000;--surface:#1B1C1F;--ink:#F2F4F7;--muted:#A0A8B4;--border:#2E3137;--blue:#5B9BF8;--on-blue:#0A1B30;--soft:#14263D}}
</style>
<main><h1>Your bean</h1>
<div class="layout"><aside class="panel preview"><div id="hero" role="img" aria-label="Your customized bean"></div><button class="primary" id="shuffle">Surprise me</button><div class="sizes" id="sizes"></div><div class="dark" id="dark" aria-label="Preview on a dark background"></div><div class="actions"><button class="secondary" id="download">Download SVG</button><button class="secondary" id="copy">Copy settings</button></div><p class="status" id="status" aria-live="polite"></p></aside>
<div class="panel"><section><h2>Hats</h2><div class="options" id="hats"></div></section><section><h2>Color</h2><div class="swatches" id="colors"></div></section><section><h2>Eyes</h2><div class="options" id="eyes"></div></section><section><h2>Mouth</h2><div class="options" id="mouth"></div></section><section><h2>Hair</h2><div class="options" id="hair"></div></section></div></div>
<footer>Hat concepts · Not saved to your account.</footer></main>
<script>
${js.replace(/^export /gm, '')}
${hatJs.replace(/^export /gm, '')}
let current = {...randomBeanAvatar(),hat:'cap'};
const avatarSvg = config => beanHatPreviewSvg(config,config.hat);
const el = (id) => document.getElementById(id);
function button(label, contents, action, selected, className){const b=document.createElement('button');b.type='button';b.className=className;b.setAttribute('aria-label',label);b.setAttribute('aria-pressed',String(selected));b.innerHTML=contents;b.onclick=action;return b;}
function render(){
 el('hero').innerHTML=avatarSvg(current);
 el('sizes').innerHTML=[24,32,48,64].map(size=>'<div class="sample">'+avatarSvg(current).replace('width="128" height="128"','width="'+size+'" height="'+size+'"')+'<span>'+size+' px</span></div>').join('');
 el('dark').innerHTML=avatarSvg(current)+avatarSvg({...current,color:'oat'});
 el('hats').replaceChildren(...BEAN_HAT_CONCEPTS.map(part=>button(part.label,avatarSvg({...current,hat:part.id}),()=>{current.hat=part.id;render()},current.hat===part.id,'option')));
 el('colors').replaceChildren(...BEAN_COLORS.map(c=>button(c.label,'<span style="background:'+c.hex+'"></span>'+c.label,()=>{current.color=c.id;render()},current.color===c.id,'swatch')));
 for(const [field,parts] of [['eyes',BEAN_EYES],['mouth',BEAN_MOUTHS],['hair',BEAN_HAIR]]){
  el(field).replaceChildren(...parts.map(p=>{const config={...current,eyes:'dots',mouth:'none',hair:'none',hat:field==='hair'?'none':current.hat,[field]:p.id};return button(p.label,avatarSvg(config),()=>{current[field]=p.id;if(field==='hair')current.hat='none';render()},current[field]===p.id,'option')}));
 }
}
el('shuffle').onclick=()=>{current={...randomBeanAvatar(),hat:current.hat};render();el('status').textContent=''};
el('download').onclick=()=>{const url=URL.createObjectURL(new Blob([avatarSvg(current)],{type:'image/svg+xml'}));const a=document.createElement('a');a.href=url;a.download='pathly-bean.svg';a.click();setTimeout(()=>URL.revokeObjectURL(url),1000);el('status').textContent='SVG downloaded.'};
el('copy').onclick=async()=>{try{await navigator.clipboard.writeText(JSON.stringify(current,null,2));el('status').textContent='Avatar settings copied.'}catch{el('status').textContent='Clipboard unavailable. Your settings: '+JSON.stringify(current)}};
render();
</script></html>`;
await fs.writeFile(path.join(output, 'preview.html'), html);
console.log(`Exported ${kit.BEAN_PRESETS.length} preset SVGs, ${kit.BEAN_EYES.length + kit.BEAN_MOUTHS.length + kit.BEAN_HAIR.length} part SVGs, body, settings, and interactive preview to ${output}`);
