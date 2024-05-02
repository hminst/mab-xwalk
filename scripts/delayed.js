// eslint-disable-next-line import/no-cycle
import { sampleRUM } from './aem.js';

// Core Web Vitals RUM collection
sampleRUM('cwv');

// add more delayed functionality here


let coreComp = document.createElement("script");
coreComp.setAttribute("src", "/scripts/mab/container.js");
document.body.appendChild(coreComp);

let scriptEle = document.createElement("script");
scriptEle.setAttribute("src", "/scripts/mab/clientlib-base.js");
document.body.appendChild(scriptEle);
