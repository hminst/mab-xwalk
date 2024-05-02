export default function decorate(block) {
    let metaDescription = document.querySelector('meta[name="description"]')
    
    if (!metaDescription) {
        metaDescription = document.createElement('meta')
    }
    metaDescription.setAttribute("content", "this is our main menu");
    
    const mabMenu = document.createElement('mab-menu');
    mabMenu.setAttributeNS(null, 'id',"Trading Entity.12345");
    mabMenu.setAttributeNS(null, "api-url", 'https://api-development.mbplc.io/mabapi-menu-v2-poc/api/v1/menus/dynamic')
    mabMenu.setAttributeNS(null, 'brand-id',"Example brand");
    mabMenu.setAttributeNS(null, 'id-type',"brand");
    mabMenu.setAttributeNS(null, 'menu-description-override',"Menu Description Override");
    mabMenu.setAttributeNS(null, 'menu-item-highlight-text',"Highlight Text");
    mabMenu.setAttributeNS(null, 'menu-name-override',"Menu Name Override");
    mabMenu.setAttributeNS(null, 'page-path',"harvester.co.uk");
    mabMenu.setAttributeNS(null, 'smart-chef-url',"https://www.smartchef.co.uk/brands/VintageInns");    
    block.append(mabMenu);

}