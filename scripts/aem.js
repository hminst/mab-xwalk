function e(t,n={}){const o="aem-rum";e.baseURL=e.baseURL||new URL(null==window.RUM_BASE?"https://rum.hlx.page":window.RUM_BASE,window.location),e.defer=e.defer||[];const a=t=>{e[t]=e[t]||((...n)=>e.defer.push({fnname:t,args:n}))};e.drain=e.drain||((t,n)=>{e[t]=n,e.defer.filter((({fnname:e})=>t===e)).forEach((({fnname:t,args:n})=>e[t](...n)))}),e.always=e.always||[],e.always.on=(t,n)=>{e.always[t]=n},e.on=(t,n)=>{e.cases[t]=n},a("observe"),a("cwv");try{if(window.hlx=window.hlx||{},!window.hlx.rum){const t="on"===new URLSearchParams(window.location.search).get("rum")?1:100,n=Array.from({length:75},((e,t)=>String.fromCharCode(48+t))).filter((e=>/\d|[A-Z]/i.test(e))).filter((()=>75*Math.random()>70)).join(""),a=Math.random(),s=a*t<1,i=window.performance?window.performance.timeOrigin:Date.now(),r={full:()=>window.location.href,origin:()=>window.location.origin,path:()=>window.location.href.replace(/\?.*$/,"")},c=sessionStorage.getItem(o)?JSON.parse(sessionStorage.getItem(o)):{};c.pages=(c.pages?c.pages:0)+1+(Math.floor(20*Math.random())-10),sessionStorage.setItem(o,JSON.stringify(c)),window.hlx.rum={weight:t,id:n,random:a,isSelected:s,firstReadTime:i,sampleRUM:e,sanitizeURL:r[window.hlx.RUM_MASK_URL||"path"],rumSessionStorage:c}}const{weight:a,id:s,firstReadTime:i}=window.hlx.rum;if(window.hlx&&window.hlx.rum&&window.hlx.rum.isSelected){const o=["weight","id","referer","checkpoint","t","source","target","cwv","CLS","FID","LCP","INP","TTFB"],r=(r=n)=>{const c=Math.round(window.performance?window.performance.now():Date.now()-i),l=JSON.stringify({weight:a,id:s,referer:window.hlx.rum.sanitizeURL(),checkpoint:t,t:c,...n},o),d=new URL(`.rum/${a}`,e.baseURL).href;navigator.sendBeacon(d,l),console.debug(`ping:${t}`,r)};e.cases=e.cases||{load:()=>e("pagesviewed",{source:window.hlx.rum.rumSessionStorage.pages})||!0,cwv:()=>e.cwv(n)||!0,lazy:()=>{const t=document.createElement("script");return t.src=new URL(".rum/@adobe/helix-rum-enhancer@^1/src/index.js",e.baseURL).href,document.head.appendChild(t),!0}},r(n),e.cases[t]&&e.cases[t]()}e.always[t]&&e.always[t](n)}catch(e){}}function t(){window.hlx=window.hlx||{},window.hlx.RUM_MASK_URL="full",window.hlx.codeBasePath="",window.hlx.lighthouse="on"===new URLSearchParams(window.location.search).get("lighthouse");const e=document.querySelector('script[src$="/scripts/scripts.js"]');if(e)try{const t=new URL(e.src,window.location);t.host===window.location.host?[window.hlx.codeBasePath]=t.pathname.split("/scripts/scripts.js"):[window.hlx.codeBasePath]=t.href.split("/scripts/scripts.js")}catch(e){console.log(e)}}function n(e){return"string"==typeof e?e.toLowerCase().replace(/[^0-9a-z]/gi,"-").replace(/-+/g,"-").replace(/^-|-$/g,""):""}function o(e){return n(e).replace(/-([a-z])/g,(e=>e[1].toUpperCase()))}function a(e){const t={};return e.querySelectorAll(":scope > div").forEach((e=>{if(e.children){const o=[...e.children];if(o[1]){const a=o[1],s=n(o[0].textContent);let i="";if(a.querySelector("a")){const e=[...a.querySelectorAll("a")];i=1===e.length?e[0].href:e.map((e=>e.href))}else if(a.querySelector("img")){const e=[...a.querySelectorAll("img")];i=1===e.length?e[0].src:e.map((e=>e.src))}else if(a.querySelector("p")){const e=[...a.querySelectorAll("p")];i=1===e.length?e[0].textContent:e.map((e=>e.textContent))}else i=e.children[1].textContent;t[s]=i}}})),t}async function s(e){return new Promise(((t,n)=>{if(document.querySelector(`head > link[href="${e}"]`))t();else{const o=document.createElement("link");o.rel="stylesheet",o.href=e,o.onload=t,o.onerror=n,document.head.append(o)}}))}async function i(e,t){return new Promise(((n,o)=>{if(document.querySelector(`head > script[src="${e}"]`))n();else{const a=document.createElement("script");if(a.src=e,t)for(const e in t)a.setAttribute(e,t[e]);a.onload=n,a.onerror=o,document.head.append(a)}}))}function r(e,t=document){const n=e&&e.includes(":")?"property":"name";return[...t.head.querySelectorAll(`meta[${n}="${e}"]`)].map((e=>e.content)).join(", ")||""}function c(e,t="",n=!1,o=[{media:"(min-width: 600px)",width:"2000"},{width:"750"}]){const a=new URL(e,window.location.href),s=document.createElement("picture"),{pathname:i}=a,r=i.substring(i.lastIndexOf(".")+1);return o.forEach((e=>{const t=document.createElement("source");e.media&&t.setAttribute("media",e.media),t.setAttribute("type","image/webp"),t.setAttribute("srcset",`${i}?width=${e.width}&format=webply&optimize=medium`),s.appendChild(t)})),o.forEach(((e,a)=>{if(a<o.length-1){const t=document.createElement("source");e.media&&t.setAttribute("media",e.media),t.setAttribute("srcset",`${i}?width=${e.width}&format=${r}&optimize=medium`),s.appendChild(t)}else{const o=document.createElement("img");o.setAttribute("loading",n?"eager":"lazy"),o.setAttribute("alt",t),s.appendChild(o),o.setAttribute("src",`${i}?width=${e.width}&format=${r}&optimize=medium`)}})),s}function l(){const e=(e,t)=>{t.split(",").forEach((t=>{e.classList.add(n(t.trim()))}))},t=r("template");t&&e(document.body,t);const o=r("theme");o&&e(document.body,o)}function d(e){const t=["P","PRE","UL","OL","PICTURE","TABLE","H1","H2","H3","H4","H5","H6"],n=e=>{const t=document.createElement("p");t.append(...e.childNodes),[...e.attributes].filter((({nodeName:e})=>"class"===e||e.startsWith("data-aue")||e.startsWith("data-richtext"))).forEach((({nodeName:n,nodeValue:o})=>{t.setAttribute(n,o),e.removeAttribute(n)})),e.append(t)};e.querySelectorAll(":scope > div > div").forEach((e=>{if(e.hasChildNodes()){!!e.firstElementChild&&t.some((t=>e.firstElementChild.tagName===t))?"PICTURE"===e.firstElementChild.tagName&&(e.children.length>1||e.textContent.trim())&&n(e):n(e)}}))}function h(e){e.querySelectorAll("a").forEach((e=>{if(e.title=e.title||e.textContent,e.href!==e.textContent){const t=e.parentElement,n=e.parentElement.parentElement;e.querySelector("img")||(1!==t.childNodes.length||"P"!==t.tagName&&"DIV"!==t.tagName||(e.className="button",t.classList.add("button-container")),1===t.childNodes.length&&"STRONG"===t.tagName&&1===n.childNodes.length&&"P"===n.tagName&&(e.className="button primary",n.classList.add("button-container")),1===t.childNodes.length&&"EM"===t.tagName&&1===n.childNodes.length&&"P"===n.tagName&&(e.className="button secondary",n.classList.add("button-container")))}}))}function u(e,t=""){[...e.querySelectorAll("span.icon")].forEach((e=>{!function(e,t="",n=""){const o=Array.from(e.classList).find((e=>e.startsWith("icon-"))).substring(5),a=document.createElement("img");a.dataset.iconName=o,a.src=`${window.hlx.codeBasePath}${t}/icons/${o}.svg`,a.alt=n,a.loading="lazy",e.append(a)}(e,t)}))}function m(e){e.querySelectorAll(":scope > div:not([data-section-status])").forEach((e=>{const t=[];let s=!1;[...e.children].forEach((e=>{if("DIV"===e.tagName||!s){const n=document.createElement("div");t.push(n),s="DIV"!==e.tagName,s&&n.classList.add("default-content-wrapper")}t[t.length-1].append(e)})),t.forEach((t=>e.append(t))),e.classList.add("section"),e.dataset.sectionStatus="initialized",e.style.display="none";const i=e.querySelector("div.section-metadata");if(i){const t=a(i);Object.keys(t).forEach((a=>{if("style"===a){t.style.split(",").filter((e=>e)).map((e=>n(e.trim()))).forEach((t=>e.classList.add(t)))}else e.dataset[o(a)]=t[a]})),i.parentNode.remove()}}))}async function w(e="default"){return window.placeholders=window.placeholders||{},window.placeholders[e]||(window.placeholders[e]=new Promise((t=>{fetch(`${"default"===e?"":e}/placeholders.json`).then((e=>e.ok?e.json():{})).then((n=>{const a={};n.data.filter((e=>e.Key)).forEach((e=>{a[o(e.Key)]=e.Text})),window.placeholders[e]=a,t(window.placeholders[e])})).catch((()=>{window.placeholders[e]={},t(window.placeholders[e])}))}))),window.placeholders[`${e}`]}function f(e){const t=[...e.querySelectorAll(":scope > div.section")];for(let e=0;e<t.length;e+=1){const n=t[e];if("loaded"!==n.dataset.sectionStatus){if(n.querySelector('.block[data-block-status="initialized"], .block[data-block-status="loading"]')){n.dataset.sectionStatus="loading";break}n.dataset.sectionStatus="loaded",n.style.display=null}}}function p(e,t){const n=Array.isArray(t)?t:[[t]],o=document.createElement("div");return o.classList.add(e),n.forEach((e=>{const t=document.createElement("div");e.forEach((e=>{const n=document.createElement("div");(e.elems?e.elems:[e]).forEach((e=>{e&&("string"==typeof e?n.innerHTML+=e:n.appendChild(e))})),t.appendChild(n)})),o.appendChild(t)})),o}async function g(e){const t=e.dataset.blockStatus;if("loading"!==t&&"loaded"!==t){e.dataset.blockStatus="loading";const{blockName:t}=e.dataset;try{const n=s(`${window.hlx.codeBasePath}/blocks/${t}/${t}.css`),o=new Promise((n=>{(async()=>{try{const n=await import(`${window.hlx.codeBasePath}/blocks/${t}/${t}.js`);n.default&&await n.default(e)}catch(e){console.log(`failed to load module for ${t}`,e)}n()})()}));await Promise.all([n,o])}catch(e){console.log(`failed to load block ${t}`,e)}e.dataset.blockStatus="loaded"}return e}async function y(e){f(e);const t=[...e.querySelectorAll("div.block")];for(let n=0;n<t.length;n+=1)await g(t[n]),f(e)}function b(e){const t=e.classList[0];if(t&&!e.dataset.blockStatus){e.classList.add("block"),e.dataset.blockName=t,e.dataset.blockStatus="initialized",d(e);e.parentElement.classList.add(`${t}-wrapper`);const n=e.closest(".section");n&&n.classList.add(`${t}-container`),h(e)}}function S(e){e.querySelectorAll("div.section > div > div").forEach(b)}async function E(e){const t=p("header","");return e.append(t),b(t),g(t)}async function L(e){const t=p("footer","");return e.append(t),b(t),g(t)}async function x(e){const t=document.querySelector(".block");t&&e.includes(t.dataset.blockName)&&await g(t),document.body.style.display=null;const n=document.querySelector("main img");await new Promise((e=>{n&&!n.complete?(n.setAttribute("loading","eager"),n.addEventListener("load",e),n.addEventListener("error",e)):e()}))}t(),e("top"),window.addEventListener("load",(()=>e("load"))),window.addEventListener("unhandledrejection",(t=>{e("error",{source:t.reason.sourceURL,target:t.reason.line})})),window.addEventListener("error",(t=>{e("error",{source:t.filename,target:t.lineno})}));export{p as buildBlock,c as createOptimizedPicture,b as decorateBlock,S as decorateBlocks,h as decorateButtons,u as decorateIcons,m as decorateSections,l as decorateTemplateAndTheme,w as fetchPlaceholders,r as getMetadata,g as loadBlock,y as loadBlocks,s as loadCSS,L as loadFooter,E as loadHeader,i as loadScript,a as readBlockConfig,e as sampleRUM,t as setup,o as toCamelCase,n as toClassName,f as updateSectionsStatus,x as waitForLCP,d as wrapTextNodes};