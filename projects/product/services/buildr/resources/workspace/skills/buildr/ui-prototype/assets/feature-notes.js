/** @typedef {{id:string,title:string,text:string,position?:string}} FeatureNote */
/** @typedef {{id:string,notes:FeatureNote[],states:Array<{id:string,notes:FeatureNote[]}>}} PrototypeScene */

/**
 * Framework-independent task feature cards. Plain text only; no application requests.
 * @param {HTMLElement} root
 * @param {{notes:FeatureNote[],activePosition?:string,onHighlight:(position?:string,reveal?:boolean)=>void}} options
 */
export function mountFeatureNotes(root, options) {
  const doc=root.ownerDocument;
  let fingerprint='';
  /** @type {Array<{node:HTMLElement,position?:string}>} */
  let cards=[];
  root.classList.add('prototype-features');
  function update({notes,activePosition}) {
    const next=JSON.stringify(notes);
    if(next!==fingerprint) {
      fingerprint=next;cards=[];root.replaceChildren();
      const hint=doc.createElement('p');
      hint.className='prototype-features-hint';
      hint.textContent=notes.length?'本次任务在当前画面中的功能。悬停查看对应区域，点击定位。':'此页面尚未提供与本次任务相关的功能说明。';
      root.append(hint);
      for(const note of notes) {
        const node=doc.createElement(note.position?'button':'section');
        node.className='prototype-feature';node.dataset.featureNote=note.id;
        const title=doc.createElement('strong'),body=doc.createElement('span');
        title.textContent=note.title;body.textContent=note.text;node.append(title,body);
        if(note.position) {
          node.setAttribute('type','button');
          node.addEventListener('pointerenter',event=>{if(event.pointerType!=='touch')options.onHighlight(note.position);});
          node.addEventListener('pointerleave',()=>{if(!node.matches(':focus-visible'))options.onHighlight();});
          node.addEventListener('focus',()=>options.onHighlight(note.position));
          node.addEventListener('blur',()=>options.onHighlight());
          node.addEventListener('click',()=>options.onHighlight(note.position,true));
        }
        root.append(node);cards.push({node,position:note.position});
      }
    }
    for(const card of cards)card.node.classList.toggle('is-active',Boolean(card.position&&card.position===activePosition));
  }
  update(options);
  return {update,destroy(){options.onHighlight();root.replaceChildren();root.classList.remove('prototype-features');}};
}

/** @param {Document} doc */
export function createRegionHighlighter(doc) {
  /** @param {string|null|undefined} position @param {boolean} [reveal] */
  return (position,reveal=false)=>{
    doc.querySelectorAll('[data-prototype-highlight]').forEach(el=>el.removeAttribute('data-prototype-highlight'));
    if(!position)return;
    const nodes=[...doc.querySelectorAll('[data-prototype-position]')].filter(el=>el.getAttribute('data-prototype-position')===position&&el.getClientRects().length);
    nodes.forEach(el=>el.setAttribute('data-prototype-highlight','true'));
    if(reveal)nodes[0]?.scrollIntoView({block:'nearest',inline:'nearest',behavior:'smooth'});
  };
}

/**
 * Optional sandbox reading bridge. Card highlights never invoke onSelect.
 * @param {{pages:PrototypeScene[],getSelection:()=>{page:string,state:string},onSelect:(page:string,state:string)=>void}} options
 * @param {Window} [win]
 */
export function connectPrototype(options,win=window) {
  const doc=win.document,paint=createRegionHighlighter(doc);
  let nonce='';
  const notes=(page,state)=>{
    const scene=options.pages.find(p=>p.id===page);
    return scene?[...scene.notes,...(scene.states.find(s=>s.id===state)?.notes||[])]:[];
  };
  const receive=event=>{
    const m=event.data;
    if(event.source!==win.parent||!m||typeof m.nonce!=='string'||!m.nonce)return;
    const scene=options.pages.find(p=>p.id===m.page);
    if(!scene||(m.state!==''&&!scene.states.some(s=>s.id===m.state)))return;
    if(m.type==='buildr:prototype:select'){
      nonce=m.nonce;paint(null);options.onSelect(m.page,m.state);
      win.requestAnimationFrame(()=>{
        const current=options.getSelection();
        if(nonce===m.nonce&&current.page===m.page&&current.state===m.state&&win.parent!==win)
          win.parent.postMessage({type:'buildr:prototype:rendered',nonce,page:m.page,state:m.state},'*');
      });
      return;
    }
    const current=options.getSelection();
    if(m.type!=='buildr:prototype:highlight'||m.nonce!==nonce||m.page!==current.page||m.state!==current.state)return;
    if(m.position!==null&&(typeof m.position!=='string'||!notes(m.page,m.state).some(n=>n.position===m.position)))return;
    paint(m.position,m.reveal===true);
  };
  const region=target=>{
    const current=options.getSelection(),declared=notes(current.page,current.state);
    let node=target?.nodeType===1?target:null;
    while(node){const position=node.getAttribute('data-prototype-position');if(position&&declared.some(n=>n.position===position))return position;node=node.parentElement;}
    return null;
  };
  const inform=position=>{
    paint(position);
    if(win.parent!==win&&nonce)win.parent.postMessage({type:'buildr:prototype:highlight',nonce,...options.getSelection(),position},'*');
  };
  const enter=event=>inform(region(event.target));
  const leave=event=>inform(region(event.relatedTarget));
  win.addEventListener('message',receive);
  doc.addEventListener('pointerover',enter);doc.addEventListener('pointerout',leave);
  doc.addEventListener('focusin',enter);doc.addEventListener('focusout',leave);
  if(win.parent!==win)win.parent.postMessage({type:'buildr:prototype:ready'},'*');
  return {
    report(page,state=''){paint(null);if(win.parent!==win&&nonce)win.parent.postMessage({type:'buildr:prototype:state',nonce,page,state},'*');},
    destroy(){nonce='';win.removeEventListener('message',receive);doc.removeEventListener('pointerover',enter);doc.removeEventListener('pointerout',leave);doc.removeEventListener('focusin',enter);doc.removeEventListener('focusout',leave);paint(null);},
  };
}
