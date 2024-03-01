
import displayBirthdays from "./components/birthday_drawer"
import { showToast } from './components/toast';
import { getAllPeople,
        getEventInfo,
        getPageUID,
        parseAgendaPull } from './utils'
import { createLastWeekCalls, createLastMonthCalls, createPersonTemplates, createCallTemplates } from './components/call_templates';

const testing = true
const version = "v0.9.6.2"

const plugin_title = "Roam CRM"

let googleLoadedHandler;

const pullPattern = "[:block/_refs :block/uid :node/title {:block/_refs [{:block/refs[:node/title]} :node/title :block/uid :block/string]}]";
const entity = '[:node/title "Agenda"]';
const pullFunction = async function a(before, after) { await parseAgendaPull(after); };

function versionTextComponent() { 
  return (
    React.createElement(
      "div",
      {},
      version
  )
  );
}

const panelConfig = {
  tabTitle: plugin_title,
  settings: [
    {id:     "version-text",
         name:   "Version",
         action: {type:     "reactComponent",
                  component: versionTextComponent}},
    // {
    //   id: "calendar-setting",
    //   name: "Import Today's Calender Events On Load",
    //   description: "Imports today's call events from a linked google calendar. Requires the Google extension from Roam Depot to be installed.",
    //   action: {
    //     type: "switch",
    //     onChange: (evt) => { console.log("Switch!", evt); }
    //   }},
      
    {
      id: "call-rollup-query",
      name: "Import Call Rollup Queries",
      description: "Imports the rollup query templates to your `[[Call]]` page. These can be referenced or added to templates as needed.",
      action: {
        type: "button",
        onClick: async () => { 
          const callPageUID = await getPageUID("Call")          
          createLastMonthCalls(callPageUID)
          createLastWeekCalls(callPageUID)
          
          showToast(`Templates Added.`, "SUCCESS");
        },
        content: "Import"
      }
    },
    {
      id: "call-template",
      name: "Import Call Template",
      description: "Imports the call template into your roam/templates page. This template structure is important for the rolloup queries to work.",
      action: {
        type: "button",
        onClick: async () => { 
          const templatePageUID = await getPageUID("roam/templates")          
          createCallTemplates(templatePageUID)
          showToast(`Template Added.`, "SUCCESS");

        },
        content: "Import"
      }
    },
    {
      id: "person-template",
      name: "Imports Person Metadata Template",
      description: "Imports the persom metadata template into your roam/templates page. This template structure is important for Roam CRM to work.",
      action: {
        type: "button",
        onClick: async () => { 
          const templatePageUID = await getPageUID("roam/templates")          
          createPersonTemplates(templatePageUID)
          showToast(`Template Added.`, "SUCCESS");

        },
        content: "Import"
      }
    },
    // {
    //   id: "switch-setting",
    //   name: "Switch Test",
    //   description: "Test switch component",
    //   action: {
    //     type: "switch",
    //     onChange: (evt) => { console.log("Switch!", evt); }
    //   }
    // },
    // {
    //   id: "input-setting",
    //   name: "Input test",
    //   action: {
    //     type: "input",
    //     placeholder: "placeholder",
    //     onChange: (evt) => { console.log("Input Changed!", evt); }
    //   }
    // },
    // {
    //   id: "select-setting",
    //   name: "Select test",
    //   action: {
    //     type: "select",
    //     items: ["one", "two", "three"],
    //     onChange: (evt) => { console.log("Select Changed!", evt); }
    //   }
    // }
  ]
};

async function crmbutton(extensionAPI) { //creates a new left sidebar log button below Daily Notes
  
  if (!document.getElementById('crmDiv')) {
    var divCRM = document.createElement('div');
    divCRM.classList.add('log-button');
    divCRM.innerHTML = "Roam CRM";
    divCRM.id = 'crmDiv';
    var spanCRM = document.createElement('span');
    spanCRM.classList.add('bp3-icon', 'bp3-icon-people', 'icon');
    divCRM.prepend(spanCRM);
    var sidebarcontent = document.querySelector("#app > div.roam-body > div.roam-app > div.roam-sidebar-container.noselect > div"),
        sidebartoprow = sidebarcontent.childNodes[1];
    if (sidebarcontent && sidebartoprow) {
      sidebartoprow.parentNode.insertBefore(divCRM, sidebartoprow.nextSibling);    
    }
    divCRM.onclick = async () => {      
      const allPeople = await getAllPeople();
      const lastBirthdayCheckDate = getLastBirthdayCheckDate(extensionAPI);

      displayBirthdays(allPeople, lastBirthdayCheckDate);
    };
  }
}

function getLastBirthdayCheckDate(extensionAPI) {
  return extensionAPI.settings.get('last-birthday-check-date') || '01-19-2024'
}

function getCalendarSetting(extensionAPI) {
  return extensionAPI.settings.get('calendar-setting') || false
}

async function setDONEFilter(page) {
  
  
  // sets a page filter to hide DONE tasks
  var fRemoves = await window.roamAlphaAPI.ui.filters.getPageFilters({"page": {"title": page}})["removes"]
  // check if DONE is already filtered. if not add it
  const containsDONE = fRemoves.includes("DONE");
  // console.log(fRemoves, containsDONE);
  
  if (!containsDONE) {
    // console.log(`Set DONE filter for: ${page}`);
    fRemoves.push("DONE")
    await window.roamAlphaAPI.ui.filters.setPageFilters(
      {
        "page": {"title": page},
        "filters": {"removes": fRemoves}
      })
  } 
  
}

function createGoogleLoadedHandler(people, extensionAPI) {
  // handler for loading events once the google extension has finished loading
  return async function handleGoogleLoaded() {
    if (window.roamjs?.extension.smartblocks) {
      await getEventInfo(people, extensionAPI, testing);
    }
  };
}

async function onload({ extensionAPI }) {
  extensionAPI.settings.panel.create(panelConfig);
  const ts1 = new Date().getTime();

  const people = await getAllPeople()
  // add left sidebar button
  crmbutton(extensionAPI)
  if (testing) {
    displayBirthdays(people, '01-19-2024')
  } else {
    displayBirthdays(people, getLastBirthdayCheckDate(extensionAPI))
  }

  // update last birthday check since it's already happened
  extensionAPI.settings.set(
    'last-birthday-check-date',
    window.roamAlphaAPI.util.dateToPageUid(new Date))

  
  // bring in the events, this should rely on getLastBirthdayCheckDate to avoid duplicates
  // listen for the google extension to be loaded
  if (window.roamjs?.extension?.google) {
    await getEventInfo(people, extensionAPI, testing)
  } else {
    googleLoadedHandler = createGoogleLoadedHandler(people, extensionAPI);
    document.body.addEventListener('roamjs:google:loaded', googleLoadedHandler);
    
  }

  // always set people pages to hide DONE
  // TODO see if they want more granulity
  people.forEach(async page =>  {
    await setDONEFilter(page.title)
  });

  // Command Palette Sidebar - Close first block
  extensionAPI.ui.commandPalette.addCommand(
    {
      label: 'Sidebar - Close first block',
      "disable-hotkey": false,
      callback: async () => {
        async function removeWindow(w) {
          window.roamAlphaAPI.ui.rightSidebar.removeWindow(
            {
              "window":
              {
                "type": w['type'],
                "block-uid": w['block-uid'] || w['page-uid'] || w['mentions-uid']
              }
            }
          )
        }

        let sidebarWindows = window.roamAlphaAPI.ui.rightSidebar.getWindows();
        const filteredBlocks = sidebarWindows.filter(obj => !obj["pinned?"]);
        if (filteredBlocks.length > 0) {
          filteredBlocks.sort((a, b) => a.order - b.order);
          await removeWindow(filteredBlocks[0])
        }

      }
    }
  )
  // Command Palette Sidebar - Cursor in first block
  extensionAPI.ui.commandPalette.addCommand(
    {
      label: 'Sidebar - Cursor in first block',
      "disable-hotkey": false,
      callback: async () => {
        let sidebarWindows = window.roamAlphaAPI.ui.rightSidebar.getWindows();

        if (sidebarWindows.length > 0) {
          let first = sidebarWindows[0];
          if (first.type == "block") {
            window.roamAlphaAPI.ui.setBlockFocusAndSelection(
              {
                location: {
                  "block-uid": first['block-uid'],
                  "window-id": first['window-id']
                }
              })
          } else if (first.type == "outline") {
            let query = `[:find (pull ?e [:block/string :block/uid :block/children :block/order {:block/children ...}])
                            :in $ ?uid
                            :where 
                  [?e :block/uid ?uid]
                  ]`;

            let result = window.roamAlphaAPI.q(query, first['page-uid']).flat();
            const selectedObject = result[0].children.find(obj => obj.order === 0);
            window.roamAlphaAPI.ui.setBlockFocusAndSelection(
              {
                location: {
                  "block-uid": selectedObject['uid'],
                  "window-id": first['window-id']
                }
              })
          }
        }

      }
    }
  )

  // run the initial agenda addr  
  await parseAgendaPull(window.roamAlphaAPI.pull(pullPattern, entity));
  
  // agenda addr pull watch
  window.roamAlphaAPI.data.addPullWatch(
    pullPattern,
    entity,
    pullFunction
  )

  if (!testing) {
    console.log(`load ${plugin_title} plugin`);
  }
  

}

function onunload() {
  document.body.removeEventListener('roamjs:google:loaded', googleLoadedHandler);

  window.roamAlphaAPI.data.removePullWatch(
    pullPattern,
    entity,
    pullFunction
  )
  var crmDiv = document.getElementById('crmDiv');
  crmDiv.remove();
  
  if (!testing) {
    console.log(`unload ${plugin_title} plugin`);
  }

}

export default {
  onload,
  onunload
};
