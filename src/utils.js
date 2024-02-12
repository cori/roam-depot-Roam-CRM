import createBlock from "roamjs-components/writes/createBlock"
import createPage from "roamjs-components/writes/createPage"

function isSecondDateAfter(firstDateString, secondDateString) {
  // Parse the dates from the strings
  const firstDate = new Date(firstDateString);
  const secondDate = new Date(secondDateString);

  // Compare the dates
  return secondDate > firstDate;
}

function getLastCalendarCheckDate(extensionAPI) {
  return extensionAPI.settings.get('last-calendar-check-date') || '01-19-2024'
}

function parseStringToDate(dateString) {
  const defaultYear = new Date().getFullYear(); // Use the current year as default

  // Array of month names for parsing
  const monthNames = [
    'January', 'February', 'March', 'April',
    'May', 'June', 'July', 'August',
    'September', 'October', 'November', 'December'
  ];

  // Remove any st, nd, rd, th suffixes from day
  dateString = dateString.replace(/(\d+)(st|nd|rd|th)/, '$1');
  
  // Split the dateString into parts
  const parts = dateString.split(' ');

  let month, day, year;

  // Check the length of parts to determine the format
  if (parts.length === 2) {
    // Format: Month Day
    month = monthNames.indexOf(parts[0]);
    day = parseInt(parts[1], 10);
    year = defaultYear;
  } else if (parts.length === 3) {
    // Try to parse the year first, as it's unambiguous
    year = parseInt(parts[2], 10);
    if (isNaN(year)) {
      // If the year isn't a number, assume it's a part of the day and use the default year
      day = parseInt(parts[1], 10);
      month = monthNames.indexOf(parts[0]);
      year = defaultYear;
    } else {
      // If the year is a number, parse the month and day
      month = monthNames.indexOf(parts[0]);
      day = parseInt(parts[1], 10);
    }
  } else {
    // Invalid format
    console.error('Invalid date format');
    return null;
  }

  // Check for invalid month or day
  if (month === -1 || isNaN(day) || isNaN(year)) {
    console.error('Invalid date components');
    return null;
  }

  // Create a Date object
  const dateObject = new Date(year, month, day);
  
  return dateObject;
}

export async function getAllPeople() {

  let query = `[:find (pull ?PAGE [:attrs/lookup
                                  :block/string
                                  :block/uid
                                  :node/title
                                  {:attrs/lookup [:block/string :block/uid]} ])
            :where
              [?Tags-Ref :node/title "Tags"]
              [?person-Ref :node/title "people"]
              [?node :block/page ?PAGE]
              [?PEOPLEdec :block/parents ?PAGE]
              [?PEOPLEdec :block/refs ?Tags-Ref]
              [?PEOPLEdec :block/refs ?person-Ref]
              (not
                  [?PAGE :node/title "roam/templates"]      
              )
              (not
                  [?PAGE :node/title "SmartBlock"]      
              )
  ]`;
  console.log("~~ Running People query");
  
  let results = await window.roamAlphaAPI.q(query).flat();
  console.log("~~~ People result: ", results);
  
  function extractElementsWithKeywords(data, keywords) {
    console.log("extracing keyword elements");
    
      return data.map(item => {
          // Initialize an object to hold the categorized items with empty arrays
          const categorizedItems = keywords.reduce((acc, keyword) => {
              const propName = keyword.replace(/::/g, '');
              acc[propName] = []; // Initialize each property with an empty array
              return acc;
          }, {});

          // Check if lookup exists and is an array
          if (Array.isArray(item.lookup)) {
              // Iterate over each keyword
              keywords.forEach(keyword => {
                  // Filter the lookup array for items containing the current keyword
                  const filteredLookup = item.lookup.filter(lookupItem => {
                      return lookupItem.string && lookupItem.string.includes(keyword);
                  });

                  // Assign the filtered array to the corresponding property
                  const propName = keyword.replace(/::/g, '');
                  categorizedItems[propName] = filteredLookup;
              });
          }

          // Return the original item with the categorized items added
          return {
              ...item,
              ...categorizedItems,
          };
      });
  }

  // Define the attributes to extract for
  const keywords = ["Birthday::", "Contact Frequency::", "Last Contacted::", "Email::", "Relationship Metadata::"];


  return extractElementsWithKeywords(results, keywords);
}

function findPersonNameByEmail(people, email) {
  const result = people
      .filter(item => item.Email.some(emailItem => emailItem.string.includes(email)))
      .map(item => item.title);
  return result
}
function findPersonByEmail(people, email) {
  const result = people
      .filter(item => item.Email.some(emailItem => emailItem.string.includes(email)))
      
  return result
}

export async function getEventInfo(people, extensionAPI, testing) {
  const lastCalendarCheck = getLastCalendarCheckDate(extensionAPI)
  console.log("lastCalendarCheck", lastCalendarCheck);
  const todaysDNPUID = window.roamAlphaAPI.util.dateToPageUid(new Date)
  // override if testing version
  let checkDate 
  if (testing===true) {
    checkDate = testing
  } else {
    checkDate = isSecondDateAfter(lastCalendarCheck, todaysDNPUID)
  }
  if (checkDate) {
    await window.roamjs.extension.google.fetchGoogleCalendar({
        startDatePageTitle: window.roamAlphaAPI.util.dateToPageTitle(new Date())
    }).then(results => {      
        // Iterate through each response and split the string
        // TODO add a check for if you're not logged in
        if (results[0].text!=='No Events Scheduled for Selected Date(s)!') {
            
            // create parent Call block at the top of the DNP
            let newBlockUID = window.roamAlphaAPI.util.generateUID()
            
            window.roamAlphaAPI.createBlock(
                {"location": 
                    {"parent-uid": window.roamAlphaAPI.util.dateToPageUid(new Date()), 
                    "order": 0}, 
                "block": 
                    {"string": "Calls Today",
                    "heading":3,
                    "open":true,
                    "uid": newBlockUID}})

            results.forEach(async result => {
                // I split the result string manually here
                // TODO update this when the PR goes through
              console.log("event result",result);
              
                // let [summary, description, location, start, end, attendees] = result.text.split("=:=");
                let attendees = result.event.attendees
                // // only process events with more than 1 confirmed attendee
                if (attendees.length > 1) {

                    let attendeeNames = []
                    attendees.forEach(a => {
                        let name = findPersonNameByEmail(people, a.email)
                        if (name.length > 0) {
                            // push the formatted person page name
                            attendeeNames.push(`[[${name[0]}]]`)
                        } else {
                            attendeeNames.push(a.email)
                        }
                    });
                    let headerString = `[[Call]] with ${attendeeNames.join(" and ")} about **${result.event.summary}**`

                    const blockJSON = [
                        {
                            string: headerString, 
                            children:[
                                { string: "Notes::", children:[{string: ""}] },
                                { string: "Next Actions::", children:[{string: ""}] },
                                ]
                        }
                        ]
                    createChildren(newBlockUID, blockJSON)
                }

            });  
        }
        
    }).catch(error => {
        console.error(error);
    });
    extensionAPI.settings.set(
    'last-calendar-check-date',
    todaysDNPUID)
  }
}

export async function getPageUID(page) {
  // Perform Roam Research datalog pull
const result = window.roamAlphaAPI.data.pull("[:node/title :block/uid]", `[:node/title "${page}"]`);

if (result && result[":block/uid"]) {
// If data exists, return the existing block UID
return result[":block/uid"];
} else {
const newPageUid = window.roamAlphaAPI.util.generateUID()
createPage({title:page, uid:newPageUid})
return newPageUid;
}

}

// const blockJSON = [
//   {
//     string: "**Birthdays Today**", children:
//       [
//           { string: "[Person Name](birthday_UID)" },
//         ...
//         ]
//   }
// ]

export async function createChildren(parentBlockUid, childrenContents) {
  for (let index = 0; index < childrenContents.length; index++) {
    const element = childrenContents[index];
    const newBlockUID = roamAlphaAPI.util.generateUID();
    window.roamAlphaAPI.createBlock(
      {
        "location":
          { "parent-uid": parentBlockUid, "order": 0 },
        "block":
          { "string": element.string, "uid": newBlockUID }
      },
    )
    if (element.children) {
      createChildren(newBlockUID, element.children)
    }
  }
}

function shouldContact(person) {
  // Define the current date
  const currentDate = new Date();

  // Define the intervals in milliseconds
  const intervals = {
    "A List": 14 * 24 * 60 * 60 * 1000, // Every two weeks
    "B List": 2 * 30 * 24 * 60 * 60 * 1000, // Roughly every two months
    "C List": 6 * 30 * 24 * 60 * 60 * 1000, // Roughly every six months
    "D List": 365 * 24 * 60 * 60 * 1000, // Once a year
  };

  // Extract the relevant properties from the person object
  const { contact_list, last_contact, name } = person;

  // Convert the last_contact string to a Date object
  const lastContactDate = new Date(last_contact);
  
  // Calculate the next contact date based on the last_contact date and the interval for the contact_list
  const nextContactDate = new Date(lastContactDate.getTime() + intervals[contact_list]);

  // Determine if the current date is past the next contact date
  return currentDate >= nextContactDate;
}

function checkBirthdays(person) {
  const today = new Date();
  today.setHours(0, 0, 0, 0); // Normalize today's date to start of day for comparison

  let aAndBBirthdaysToday;
  let otherBirthdaysToday;
  let filteredUpcomingBirthdays;

  const personBirthday = new Date(person.birthday);
  const currentYear = today.getFullYear();

  personBirthday.setFullYear(currentYear); // Set birthday year to current year for comparison
  personBirthday.setHours(0, 0, 0, 0); // Normalize birthday to start of day for comparison
  
  
  const timeDiff = personBirthday - today;
  const daysDiff = timeDiff / (1000 * 60 * 60 * 24);



  if (daysDiff === 0) {
      // Separate today's birthdays into two categories
      // A & Bs will be in the notification
      // C & Ds will be block ref'd to the DNP
    if (person.contact_list === "A List" || person.contact_list === "B List") {
      aAndBBirthdaysToday = person
    } else {
      otherBirthdaysToday = person
    }
  } else if (daysDiff > 0 && daysDiff <= 14) {     
    person["daysUntilBirthday"] = Math.ceil(daysDiff)
    if (person.contact_list === "A List" || person.contact_list === "B List") {
      filteredUpcomingBirthdays = person
    }
  }

  return {
    aAndBBirthdaysToday,
    otherBirthdaysToday,
    filteredUpcomingBirthdays
  };
}

function fixPersonJSON(person) {
  // parse through raw strings and extract important info
  const birthdayDateString = person["Birthday"].length > 0
    ? person["Birthday"][0].string.split("::", 2)[1].replace(/\[|\]/g, '') || ""
    : "";
  const birthday = parseStringToDate(birthdayDateString.trim()) || null
  let contactDateString;
  let last_contact
  let contactUIDString
  let newRelationshipUID
  console.log(person);
  
  // Check if person["Last Contacted"] is not empty
  if (person["Last Contacted"].length > 0) {
     contactDateString = person["Last Contacted"][0].string.split("::", 2)[1].replace(/\[|\]/g, '') || null;
     if (contactDateString === null) {
      last_contact = new Date()
    } else {
      last_contact = parseStringToDate(contactDateString.trim())
    }
    contactUIDString = person["Last Contacted"][0].uid || null;
    
    
  }  else {
    // there is no "last contacted" attribute so let's create one
    contactUIDString = window.roamAlphaAPI.util.generateUID()
    contactDateString = roamAlphaAPI.util.dateToPageTitle(new Date())
    last_contact = parseStringToDate(contactDateString.trim()) || new Date();
    console.log("relationship meta uid", contactUIDString, contactDateString, last_contact);

    // Check if Relationship Metadata and property exist
    if (person && person["Relationship Metadata"] && person["Relationship Metadata"][0]) {
      // If the object and property exist, create a child
      createBlock({
        node:{
          text: `Last Contacted:: [[${contactDateString}]]`,
          uid:contactUIDString
        },
        parentUid:person["Relationship Metadata"][0].uid
      })
    } else {
      // If the object or property does not exist, create both the parent and the child
      console.log("Object or property does not exist");
      newRelationshipUID = window.roamAlphaAPI.util.generateUID()
      createBlock({
        node:{
          text: `Relationship Metadata::`,
          uid:newRelationshipUID,
          children:[
            {
              text: `Last Contacted:: [[${contactDateString}]]`,
              uid: contactUIDString,
            }
          ]
        },
        parentUid:person.uid
      })
      person["Relationship Metadata"].push({"string": "Relationship Metadata::",  "uid": newRelationshipUID})
      person["Last Contacted"].push({"string": "Last Contacted::",  "uid": contactUIDString})
      console.log("after new data", person);
      
      // Your code here for when the property does not exist
    }

    
  }
  
  let contact 
  
  // set the contact list
  if (person["Contact Frequency"].length=== 0) {
    // there is no contact frequency node so add one
    const contactFrequenceUID = window.roamAlphaAPI.util.generateUID()
    createBlock({
      node:{
        text: `Contact Frequency:: #[[C List]]: Contact every six months`,
        uid: contactFrequenceUID,
      },
      parentUid:person["Relationship Metadata"][0].uid
    })
    person["Contact Frequency"].push({"string": `Contact Frequency:: #[[C List]]: Contact every six months`,  "uid": contactFrequenceUID})
    contact = "C List";
  } else if (person["Contact Frequency"][0].string .includes("C List")) {
    contact = "C List";
  } else if (person["Contact Frequency"][0].string .includes("A List")) {
    contact = "A List";
  } else if (person["Contact Frequency"][0].string .includes("B List")) {
    contact = "B List";
  } else if (person["Contact Frequency"][0].string .includes("D List")) {
    contact = "D List";
  } else {
    // Default value if none of the keywords are found
    contact = "C List";
  }
  person.birthday = birthday
  person.contact_list = contact
  console.log("birthday-uid");
  person.birthday_UID = person?.Birthday?.[0]?.uid || null;
  person.last_contact = last_contact
  person.last_contact_uid = contactUIDString
  person.name = person.title

  return person

}

function remindersSystem(people, lastBirthdayCheck) {
  let birthdays = {
    aAndBBirthdaysToday: [],
    otherBirthdaysToday: [],
    filteredUpcomingBirthdays: [],
  }
  let toBeContacted = []
  // for each person extract the needed info
  people.forEach(person => {
    // fix the json
    
    person = fixPersonJSON(person)
    if (shouldContact(person)) {
      toBeContacted.push(person) //{"toBeContacted": "reminders"}
    }
    
    let filteredBirthdays = checkBirthdays(person)
    if (filteredBirthdays.aAndBBirthdaysToday) {
      birthdays.aAndBBirthdaysToday.push(filteredBirthdays.aAndBBirthdaysToday)
    }
    if (filteredBirthdays.otherBirthdaysToday) {
      birthdays.otherBirthdaysToday.push(filteredBirthdays.otherBirthdaysToday)
    } 
    if (filteredBirthdays.filteredUpcomingBirthdays) {
      birthdays.filteredUpcomingBirthdays.push(filteredBirthdays.filteredUpcomingBirthdays)
    } 
    
  });
  
  // check if there are lower priority birthdays and create on DNP
  const todaysDNPUID = window.roamAlphaAPI.util.dateToPageUid(new Date)
  if (isSecondDateAfter(lastBirthdayCheck, todaysDNPUID) & birthdays.otherBirthdaysToday.length>0) {
      // block ref other today birthdays to the DNP
    const blockJSON = [
      {
          string: "**Birthdays Today**",
          children: birthdays.otherBirthdaysToday.map(p => ({
              string: `[${p.name}](((${p.birthday_UID})))`
          }))
      }
    ];
        
    createChildren(todaysDNPUID, blockJSON)
  }
    
  const mergedReminders = {
      ... birthdays,
      toBeContacted:toBeContacted
  }
  
  return mergedReminders
}

export default remindersSystem;

