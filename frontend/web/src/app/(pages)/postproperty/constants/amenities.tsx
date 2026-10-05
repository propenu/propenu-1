


export type AmenityCategory =
  | "Sports"
  | "Convenience"
  | "Safety"
  | "Environment"
  | "Land"
  | "Water"
  | "Power"
  | "Infrastructure"
  | "Connectivity";

export const RESIDENTIAL_AMENITIES = [
  // 🏃 Sports
  {
    key: "gym",
    title: "Gym",
    category: "Sports",
    icon: "/icons/amenities/gym.svg",
  },
  {
    key: "swimming_pool",
    title: "Swimming Pool",
    category: "Sports",
    icon: "/icons/amenities/swimming_pool.svg",
  },
  {
    key: "jogging_track",
    title: "Jogging Track",
    category: "Sports",
    icon: "/icons/amenities/Jogging.svg",
  },
  {
    key: "children_play",
    title: "Kid's Play Area",
    category: "Sports",
    icon: "/icons/amenities/kids_play_area.svg",
  },

  // 🏢 Convenience
  {
    key: "elevator/lift",
    title: "Elevator / Lift",
    category: "Convenience",
    icon: "/icons/amenities/elevator.svg",
  },
  {
    key: "power_backup",
    title: "Power Backup",
    category: "Convenience",
    icon: "/icons/amenities/power_backup.svg",
  },
  {
    key: "club_house",
    title: "Club House",
    category: "Convenience",
    icon: "/icons/amenities/club_house.svg",
  },
  {
    key: "visitor_parking",
    title: "Visitor Parking",
    category: "Convenience",
    icon: "/icons/amenities/visitor_parking.svg",
  },

  // 🔐 Safety
  {
    key: "24x7_security",
    title: "24x7 Security",
    category: "Safety",
    icon: "/icons/amenities/24x7_security.svg",
  },
  {
    key: "cctv_video_surveillance",
    title: "CCTV Video Surveillance",
    category: "Safety",
    icon: "/icons/amenities/cctv_video_surveillance.svg",
  },
  {
    key: "fire_fighting_systems",
    title: "Fire Fighting Systems",
    category: "Safety",
    icon: "/icons/amenities/fire_fighting_systems.svg",
  },
  {
    key: "video_intercom",
    title: "Video Intercom",
    category: "Safety",
    icon: "/icons/amenities/video_intercom.svg",
  },

  // 🌱 Environment
  {
    key: "park",
    title: "Park",
    category: "Environment",
    icon: "/icons/amenities/Park.svg",
  },
  {
    key: "rainwater_harvesting",
    title: "Rainwater Harvesting",
    category: "Environment",
    icon: "/icons/amenities/rainwater_harvesting.svg",
  },
  {
    key: "solar_lighting",
    title: "Solar Lighting",
    category: "Environment",
    icon: "/icons/amenities/solar_lighting.svg",
  },
];

export const AMENITIES_FOR_COMMERCIAL = [
  // 🏃 Sports
  { key: "gym",
  title: "Gym",
  category: "Sports",
  icon: "/icons/amenities/gym.svg",
},
{
  key: "swimming_pool",
  title: "Swimming Pool",
  category: "Sports",
  icon: "/icons/amenities/swimming_pool.svg",
},

// 🏢 Convenience
{
  key: "elevator",
  title: "Elevator",
  category: "Convenience",
  icon: "/icons/amenities/elevator.svg",
},
{
  key: "power_backup",
  title: "Power Backup",
  category: "Convenience",
  icon: "/icons/amenities/power_backup.svg",
},
{
  key: "visitor_parking",
  title: "Visitor Parking",
  category: "Convenience",
  icon: "/icons/amenities/visitor_parking.svg",
},
{
  key: "atms",
  title: "ATMs",
  category: "Convenience",
  icon: "/icons/amenities/atms.svg",
},
{
  key: "ac_waiting_lobby",
  title: "AC Waiting Lobby",
  category: "Convenience",
  icon: "/icons/amenities/ac_waiting_lobby.svg",
},
{
  key: "parking",
  title: "Parking",
  category: "Convenience",
  icon: "/icons/amenities/parking.svg",
},
{
  key:"valet_parking",
  title:"Valet Parking",
  category:"Convenience",
  icon:"/icons/amenities/valet_parking.svg"
},
{
  key:"podium_parking",
  title:"Podium Parking",
  category:"Convenience",
  icon:"/icons/amenities/podium_parking.svg"
},
{
  key:"multi_level_parking",
  title:"Multi Level Parking",
  category:"Convenience",
  icon:"/icons/amenities/multi_level_parking.svg"
},

{
  key:"front_desk_service",
  title:"Front Desk Service",
  category:"Convenience",
  icon:"/icons/amenities/front_desk_service.svg"
},
{
  key:"centralized_ac",
  title:"Centralized AC",
  category:"Convenience",
  icon:"/icons/amenities/centralized_ac.svg"
},
{
  key:"24x7_water_supply",
  title:"24x7 Water Supply",
  category:"Convenience",
  icon:"/icons/amenities/24x7_water_supply.svg"
},
{
  key:"separate_entry_or_exit_gates",
  title:"Separate Entry or Exit Gates",
  category:"Convenience",
  icon:"/icons/amenities/separate_entry_or_exit_gates.svg"
},

{
  key:"automatic_boom_barriers",
  title:"Automatic Boom Barriers",
  category:"Convenience",
  icon:"/icons/amenities/automatic_boom_barriers.svg"
},
{
  key:"cafe_or_coffee_bar",
  title:"Cafe or Coffee Bar",
  category:"Convenience",
  icon:"/icons/amenities/cafe_or_coffee_bar.svg"

},


// 🔐 Safety
{
  key: "24x7_security",
  title: "24x7 Security",
  category: "Safety",
  icon: "/icons/amenities/24x7_security.svg",
},
{
  key: "cctv_video_surveillance",
  title: "CCTV Video Surveillance",
  category: "Safety",
  icon: "/icons/amenities/cctv_video_surveillance.svg",
},
{
  key: "fire_fighting_systems",
  title: "Fire Fighting Systems",
  category: "Safety",
  icon: "/icons/amenities/fire_fighting_systems.svg",
},
{
  key:"smoke_or_heat_sensors",
  title:"Smoke or Heat Sensors",
  category:"Safety",
  icon:"/icons/amenities/smoke_or_heat_sensors.svg"
},
{
  key:"smart_card_access",
  title:"Smart Card Access",
  category:"Safety",
  icon:"/icons/amenities/smart_card_access.svg"
},
{
  key:"emergency_rescue_alarms",
  title:"Emergency Rescue Alarms",
  category:"Safety",
  icon:"/icons/amenities/emergency_rescue_alarms.svg"
},
{
  key: "solar_lighting",
  title: "Solar Lighting",
  category: "Environmental",
  icon: "/icons/amenities/solar_lighting.svg",
},
{
  key:"igbc_ certified_building",
  title:"IGBC Certified Building",
  category:"Environmental",
  icon:"/icons/amenities/igbc_certified_building.svg"
},
];

export const AMENITIES_FOR_LANDPLOTS = [  
  {
    key: "24x7_water_supply",
    title: "24x7 Water Supply",
    category: "Land",
    icon: "/icons/amenities/24x7_water_supply.svg",
  },
 

  // 💧 Water
  {
    key: "borewell_open_well",
    title: "Borewell Open Well",
    category: "Water",
    icon: "/icons/amenities/borewell_open_well.svg",
  },


  // ⚡ Power
  {
    key: "electricity_connection",
    title: "Electricity Connection",
    category: "Power",
    icon: "/icons/amenities/electricity_connection.svg",
  },
  {
    key: "solar_power_provision",
    title: "Solar Power Provision",
    category: "Power",
    icon: "/icons/amenities/solar_power_provision.svg",
  },

  // 🛣 Connectivity
  {
    key: "near_highway",
    title: "Near Highway",
    category: "Connectivity",
    icon: "/icons/amenities/near_highway.svg",
  },
  {
    key: "close_to_village",
    title: "Close to Village",
    category: "Connectivity",
    icon: "/icons/amenities/close_to_village.svg",
  },

  // 🔐 Security
  {
    key: "cctv_video_surveillance",
    title: "CCTV Video Surveillance",
    category: "Safety",
    icon: "/icons/amenities/cctv_video_surveillance.svg",
  },
];

export const AMENITIES_FOR_AGRICULTURAL = [
  // 🌿 Land
  {
    key: "levelled_or_semi_levelled_land",
    title: "Levelled or Semi-Levelled Land",
    category: "Land",
    icon: "/icons/amenities/levelled_or_semi-levelled_land.svg",
  },
  {
    key:"river_harvesting_system",
    title:"River Harvesting System",
    category:"Water",
    icon:"/icons/amenities/river_harvesting_system.svg"
  },

  // 💧 Water Resources
  {
    key: "drip_irrigation_facility",
    title: "Drip Irrigation Facility",
    category: "Water",
    icon: "/icons/amenities/drip_irrigation_facility.svg",
  },
  {
    key: "sprinkler_irrigation_system",
    title: "Sprinkler Irrigation System",
    category: "Water",
    icon: "/icons/amenities/sprinkler_irrigation_system.svg",
  },
  {
    key: "canal_river_water_access",
    title: "Canal River Water Access",
    category: "Water",
    icon: "/icons/amenities/canal_river_water_access.svg",
  },
  
  // ⚡ Power
  {
    key: "water_pump_set",
    title: "Water Pump Set",
    category: "Power",
    icon: "/icons/amenities/water_pump_set.svg",
  },
  {
    key:"solar_power_provision",
    title:"Solar Power Provision",
    category:"Power",
    icon:"/icons/amenities/solar_power_provision.svg"
  },
  {
    key:"electricity_connection",
    title:"Electricity Connection",
    category:"Power",
    icon:"/icons/amenities/electricity_connection.svg"
  },
  
  // 🚜 Infrastructure
  {
    key: "cattle_shed",
    title: "Cattle Shed",
    category: "Infrastructure",
    icon: "/icons/amenities/cattle_shed.svg",
  },
  {
    key: "motor_shed",
    title: "Motor Shed",
    category: "Infrastructure",
    icon: "/icons/amenities/motor_shed.svg",
  },
  {
    key: "greenhouse",
    title: "Greenhouse",
    category: "Infrastructure",
    icon: "/icons/amenities/greenhouse.svg",
  },

  // 🏡 Residential Support 
  {
    key: "watchman_room",
    title: "Watchman Room",
    category: "Infrastructure",
    icon: "/icons/amenities/watchman_room.svg",
  },
  {
    key: "toilets_wash_area",
    title: "Toilets and Wash Area",
    category: "Infrastructure",
    icon: "/icons/amenities/toilets_wash_area.svg",
  },
  {
    key: "cctv_video_surveillance",
    title: "CCTV Video Surveillance",
    category: "Safety",
    icon: "/icons/amenities/cctv_video_surveillance.svg",
  },
];


// Backward compatible fallback used by existing screens (land + old imports)
export const AMENITIES = [...RESIDENTIAL_AMENITIES];
export const COMMERCIAL_AMENITIES = [...AMENITIES_FOR_COMMERCIAL];
export const LAND_PLOT_AMENITIES = [...AMENITIES_FOR_LANDPLOTS];
export const AGRICULTURAL_AMENITIES = [...AMENITIES_FOR_AGRICULTURAL];

export const AMENITIES_FOR_FEATURED_PROJECT = [
  { key: "swimming_pool", title: "Swimming Pool" },
  { key: "kids_pool", title: "Kids Pool" },
  { key: "gym", title: "Gym" },
  { key: "yoga_hall", title: "Yoga Hall" },
  { key: "spa", title: "Spa & Wellness Center" },
  { key: "club_house", title: "Club House" },
  { key: "amphitheatre", title: "Amphitheatre" },
  { key: "mini_theatre", title: "Mini Theatre" },
  { key: "co_working", title: "Co-Working Space" },

  { key: "garden", title: "Landscaped Garden" },
  { key: "jogging_track", title: "Jogging Track" },
  { key: "open_lawn", title: "Open Lawn" },
  { key: "kids_play_area", title: "Children's Play Area" },
  { key: "basketball_court", title: "Basketball Court" },
  { key: "tennis_court", title: "Tennis Court" },

  { key: "cctv", title: "CCTV Surveillance" },
  { key: "security", title: "24x7 Security" },
  { key: "video_door_phone", title: "Video Door Phone" },
  { key: "fire_safety", title: "Fire Safety System" },

  { key: "covered_parking", title: "Covered Parking" },
  { key: "parking", title: "Parking" },
  { key: "visitor_parking", title: "Visitor Parking" },
  { key: "ev_charging", title: "EV Charging Station" },
  { key: "wheelchair_access", title: "Wheelchair Access" },

  { key: "power_backup", title: "Power Backup" },
  { key: "elevator", title: "Elevator" },
  { key: "lift", title: "High Speed Elevators" },
  { key: "water_harvesting", title: "Rain Water Harvesting" },
  { key: "solar_lighting", title: "Solar Lighting" },
];
