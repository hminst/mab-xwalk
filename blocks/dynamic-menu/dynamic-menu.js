export default function decorate(block) {
    const mabMenu = document.createElement('mab-menu');
    const api = block.querySelectorAll('div > p > a')[0].href
    const pTags = block.querySelectorAll('div > p');
    mabMenu.setAttributeNS(null, 'id',"Trading Entity.12345");
    mabMenu.setAttributeNS(null, "api-url", api)
    mabMenu.setAttributeNS(null, 'brand-id',"Example brand");
    mabMenu.setAttributeNS(null, 'id-type',"brand");
    mabMenu.setAttributeNS(null, 'menu-description-override',pTags[3].innerHTML);
    mabMenu.setAttributeNS(null, 'menu-item-highlight-text',"Today's special");
    mabMenu.setAttributeNS(null, 'menu-name-override',"Menu Name Override");
    mabMenu.setAttributeNS(null, 'page-path',"harvester.co.uk");
    mabMenu.setAttributeNS(null, 'smart-chef-url',"https://www.smartchef.co.uk/brands/VintageInns");    
    block.append(mabMenu);
}