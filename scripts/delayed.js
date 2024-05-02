// eslint-disable-next-line import/no-cycle
import { sampleRUM } from './aem.js';

// Core Web Vitals RUM collection
sampleRUM('cwv');

// add more delayed functionality here

let coreComp = document.createElement("script");
    coreComp.setAttribute("src", "/etc.clientlibs/mab-go-web/clientlibs/container.js");
    document.body.appendChild(coreComp);
    
    let scriptEle = document.createElement("script");
    scriptEle.setAttribute("src", "/etc.clientlibs/mab-go-web/clientlibs/clientlib-base.js");
    document.body.appendChild(scriptEle);
