import { MoreFilterSection, MoreFilterSectionAGR, MoreFilterSectionCom, MoreFilterSectionLand } from "@/types";

// constants/budget.ts
export const BUDGET_MIN = 5; // 5 Lac
export const BUDGET_MAX = 5000; // 50 Cr (in Lac)
export const BUDGET_STEP = 5;

export const budgetOptions = [
  5, 10, 20, 30, 50, 75,
  100, 150, 200, 300, 400,
  500, 750, 1000, 2000, 3000, 4000, 5000,
];

// Rent values are stored in lakhs to match the shared price query conversion.
export const rentBudgetOptions = [0.05, 0.1, 0.15, 0.2, 0.3, 0.5, 0.75, 1];
export const RENT_BUDGET_MIN = 0.05;
export const RENT_BUDGET_MAX = 1;
export const RENT_BUDGET_STEP = 0.05;

export const formatRentBudget = (value: number) =>
  `₹${Math.round(value * 100000).toLocaleString("en-IN")}${value === RENT_BUDGET_MAX ? "+" : ""}`;

export const formatBudget = (value: number) => {
  if (value >= 100)
    return `₹${value / 100}${value === 5000 ? "+" : ""} Cr`;
  return `₹${value} Lac`;
};




export const CARPET_MIN = 300;
export const CARPET_MAX = 10000;

export const carpetOptions = [
  300, 500, 750, 1000, 1500, 2000, 3000, 5000, 7500, 10000,
];



export const moreFilterSections: MoreFilterSection[] = [ 
    {
      key: "Property Type",
      label: "Property Type",
      options: [
        "apartment",
        "independent-house",
        "villa",
        "penthouse",
        "farmhouse",
      ],
      selectionType: "multiple",
    },
    {
      key: "Sales Type",
      label: "Sales Type",
      options: ["new-sale", "resale"],
      selectionType: "single",
    },
    {
      key: "Posted By",
      label: "Posted By",
      options: ["Owners", "Agents", "Builders"],
      selectionType: "single",
    },
    {
      key: "Possession Status",
      label: "Possession Status",
      options: ["ready-to-move", "under-construction"],
      selectionType: "single",
    },
    { key: "Covered Area", label: "Covered Area" },
    {
      key: "Bathroom",
      label: "Bathroom",
      options: ["1+", "2+", "3+", "4+"],
      selectionType: "multiple",
    },
    {
      key: "Balcony",
      label: "Balcony",
      options: ["1+", "2+", "3+"],
      selectionType: "multiple",
    },
    {
      key: "Parking",
      label: "Parking",
      options: ["1 Car", "2 Cars"],
      selectionType: "multiple",
    },
    {
      key: "Furnishing",
      label: "Furnishing",
      options: ["Unfurnished", "Semi-Furnished", "Fully Furnished"],
      selectionType: "single",
    },
    {
      key: "Amenities",
      label: "Amenities",
      options: [
        "Lift",
        "Power Backup",
        "Gym",
        "Swimming Pool",
        "Security",
        "Club House",
        "Kid's Play Area",
        "Jogging Track",
        "Park",
        "Visitor Parking",
        "Rainwater Harvesting",
        "CCTV Surveillance",
        "Solar Lighting",
        "Fire Fighting Systems",
        "Intercom",
      ],
      selectionType: "multiple",
    },
    {
      key: "Facing",
      label: "Facing",
      options: ["East", "West", "North", "South", "North-East", "North-West", "South-East", "South-West"],
      selectionType: "multiple",
    },
    {
      key: "Posted Since",
      label: "Posted Since",
      options: [
        "All",
        "Yesterday",
        "Last Week",
        "Last 2 Weeks",
        "Last 3 Weeks",
        "Last Month",
        "Last 2 Months",
        "Last 4 Months",
      ],
      selectionType: "single",
    },
  ];




  export const commercialMoreFilterSections: MoreFilterSectionCom[] = [
    {
      key: "Commercial Type",
      label: "Commercial Type",
      options: [
        "Office",
        "Shop",
        "Showroom",
        "Warehouse",
        "Industrial",
        "Retail",
        "Co-working",
        "Restaurant",
        "Clinic"
      ],
       selectionType: "multiple",
    },
    {
      key: "Commercial Sub Type",
      label: "Commercial Sub Type",
      options: [
        "bare-shell",
        "warm-shell",
        "business-center",
      ],
       selectionType: "multiple",
    },
    {
      key: "Transaction Type",
      label: "Transaction Type",
      options: ["new-sale", "resale"],
       selectionType: "single",
    },
    {
      key: "Posted By",
      label: "Posted By",
      options: ["Owners", "Agents"],
      selectionType: "single",
    },
    {
      key: "Construction Status",
      label: "Construction Status",
      options: ["ready-to-move", "under-construction"],
       selectionType: "single",
    },
    {
      key: "Built-up Area",
      label: "Built-up Area",
    },
    {
      key: "Carpet Area",
      label: "Carpet Area",
    },
    {
      key: "Floor Number",
      label: "Floor Number",
      options: ["Ground", "1+", "5+", "10+"],
      selectionType: "multiple",
    },
    {
      key: "Total Floors",
      label: "Total Floors",
      options: ["1+", "5+", "10+", "20+"],
      selectionType: "multiple",
    },
    {
      key: "Furnishing Status",
      label: "Furnishing Status",
      options: ["unfurnished", "semi-furnished", "fully-furnished"],
      selectionType: "single",
    },
    {
      key: "Pantry",
      label: "Pantry",
      options: ["Inside Premises", "Shared"],
      selectionType: "single",
    },
    {
      key: "Power Capacity",
      label: "Power Capacity (KW)",
      options: ["10+", "25+", "50+", "100+"],
      selectionType: "multiple",
    },
    {
      key: "Parking",
      label: "Parking",
      options: ["Two-Wheeler Parking", "Four-Wheeler Parking"],
      selectionType: "multiple",
    },
    {
      key: "Fire Safety",
      label: "Fire Safety",
      options: [
        "Fire Extinguisher",
        "Sprinkler System",
        "Fire Hose Reel",
        "Fire Hydrant",
        "Smoke Detector",
        "Fire Alarm System",
        "Fire Control Panel",
        "Fire Exit Signs",
      ],
      selectionType: "multiple",
    },
    {
      key: "Flooring Type",
      label: "Flooring Type",
      options: ["Vitrified", "Granite", "Marble", "Concrete"],
      selectionType: "multiple",
    },
    {
      key: "Wall Finish",
      label: "Wall Finish",
      options: [
        "No Partitions",
        "Brick Walls",
        "Cement Block Walls",
        "Plastered Walls",
      ],
      selectionType: "multiple",
    },
    {
      key: "Tenant Available",
      label: "Tenant Available",
      options: ["Yes"],
      selectionType: "single",
    },
    {
      key: "Price Negotiable",
      label: "Price Negotiable",
      options: ["Yes"],
      selectionType: "single",
    },
    {
      key: "Amenities",
      label: "Amenities",
      options: [
        "Power Backup",
        "Elevator / Lift",
        "Centralized AC",
        "24x7 Security",
        "CCTV Surveillance",
        "Visitor Parking",
        "Fire Fighting Systems",
        "Multi Level Parking",
        "Conference Room",
        "Cafe / Food Court",
        "High Speed Internet",
        "ATM",
        "Smoke Sensors",
        "Solar Lighting",
        "Wheelchair Access",
      ],
      selectionType: "multiple",
    },
    {
      key: "Posted Since",
      label: "Posted Since",
      options: ["All", "Yesterday", "Last Week", "Last Month", "Last 3 Months"],
      selectionType: "single",
    },
  ];



  
  export  const landMoreFilterSections: MoreFilterSectionLand[] = [
    {
      key: "Land Type",
      label: "Land Type",
      options: [
        "Residential Plot",
        "Commercial Plot",
        "Industrial Plot",
      ],
      selectionType: "multiple",
    },
    {
      key: "Land Sub Type",
      label: "Land Sub Type",
      options: [
        "Gated Community",
        "Non Gated",
        "Corner",
        "Road Facing",
        "Two Side Open",
        "Three Side Open",
        "Resale",
        "New Plot",
      ],
      selectionType: "multiple",
    },
    {
      key: "Posted By",
      label: "Posted By",
      options: ["Owners", "Agents", "Builders"],
      selectionType: "single",
    },
    {
      key: "Plot Area",
      label: "Plot Area",
    },
    {
      key: "Area Unit",
      label: "Area Unit",
      options: ["sqft", "sqmt", "sqyd", "acre", "guntha", "cent", "kanal", "hectare"],
      selectionType: "multiple",
    },
    {
      key: "Dimensions",
      label: "Dimensions",
    },
    {
      key: "Road Width",
      label: "Road Width (ft)",
      options: ["20+", "30+", "40+", "60+"],
      selectionType: "multiple",
    },
    {
      key: "Facing",
      label: "Facing",
      options: ["East", "West", "North", "South", "North-East", "North-West"],
      selectionType: "multiple",
    },
    {
      key: "Corner Plot",
      label: "Corner Plot",
      options: ["Yes"],
    },
    {
      key: "Ready To Construct",
      label: "Ready To Construct",
      options: ["Yes"],
    },
    {
      key: "Water Connection",
      label: "Water Connection",
      options: ["Available"],
    },
    {
      key: "Electricity Connection",
      label: "Electricity Connection",
      options: ["Available"],
    },
    {
      key: "Approved By",
      label: "Approved By Authority",
      options: ["DTCP", "HMDA", "BDA", "RERA"],
    },
    {
      key: "Land Use Zone",
      label: "Land Use Zone",
      options: ["Residential", "Commercial", "Industrial", "Agricultural"],
    },
    {
      key: "Banks Approved",
      label: "Banks Approved",
      options: ["SBI", "HDFC", "ICICI", "Axis"],
    },
    { key: "Verified Properties", label: "Verified Properties" },
    {
      key: "Price Negotiable",
      label: "Price Negotiable",
      options: ["Yes"],
    },
    {
      key: "Amenities",
      label: "Amenities",
      options: [
        "Water Connection",
        "Electricity Connection",
        "Borewell",
        "Gated Boundary",
        "Drainage System",
        "Street Lighting",
        "Internal Roads",
        "24x7 Security",
        "CCTV Surveillance",
        "Near Highway",
        "Solar Power Provision",
        "Rainwater Harvesting",
      ],
      selectionType: "multiple",
    },
    {
      key: "Posted Since",
      label: "Posted Since",
      options: [
        "All",
        "Yesterday",
        "Last Week",
        "Last 2 Weeks",
        "Last Month",
        "Last 3 Months",
      ],
    },
  ];



  
export const agriculturalMoreFilterSections: MoreFilterSectionAGR[] = [
    {
      key: "Agricultural Type",
      label: "Agricultural Type",
      options: [
        "Farmland",
        "Wetland",
        "Dryland",
        "Dairy Farm",
      ],
      selectionType: "multiple",
    },
    {
      key: "Agricultural Sub Type",
      label: "Agricultural Sub Type",
      options: [
        "Irrigated",
        "Non Irrigated",
        "Fenced",
        "With Well",
        "With Borewell",
        "With Electricity",
        "Unfenced",
        "Near Road",
        "Inside Village",
        "Farmhouse Permission",
      ],
      selectionType: "multiple",
    },
    {
      key: "Posted By",
      label: "Posted By",
      options: ["Owners", "Agents", "Builders"],
      selectionType: "single",
    },
    {
      key: "Total Area",
      label: "Total Area",
    },
    {
      key: "Area Unit",
      label: "Area Unit",
      options: ["sqft", "sqmt", "sqyd", "acre", "guntha", "cent", "kanal", "hectare"],
    },
    { key: "Verified Properties", label: "Verified Properties" },
    {
      key: "Soil Type",
      label: "Soil Type",
      options: ["Red Soil", "Black Soil", "Alluvial Soil", "Sandy Soil"],
    },
    {
      key: "Irrigation Type",
      label: "Irrigation Type",
      options: ["Canal", "Borewell", "Drip", "Rain-fed"],
    },
    {
      key: "Number of Borewells",
      label: "Number of Borewells",
      options: ["1+", "2+", "3+", "4+"],
    },
    {
      key: "Water Source",
      label: "Water Source",
      options: ["River", "Canal", "Borewell", "Tank"],
    },
    {
      key: "Electricity Connection",
      label: "Electricity Connection",
      options: ["Available"],
    },
    {
      key: "Current Crop",
      label: "Current Crop",
      options: ["Paddy", "Cotton", "Sugarcane", "Groundnut", "Vegetables"],
    },
    {
      key: "Plantation Age",
      label: "Plantation Age (Years)",
      options: ["1+", "3+", "5+", "10+"],
    },
    {
      key: "Road Width",
      label: "Road Width",
      options: ["20+", "30+", "40+"],
    },
    {
      key: "Access Road Type",
      label: "Access Road Type",
      options: ["Mud Road", "BT Road", "CC Road"],
    },
    {
      key: "Boundary Wall",
      label: "Boundary Wall",
      options: ["Yes"],
    },
    {
      key: "State Restrictions",
      label: "State Purchase Restrictions",
      options: ["Applicable", "Not Applicable"],
    },
    {
      key: "Price Negotiable",
      label: "Price Negotiable",
      options: ["Yes"],
    },
    {
      key: "Amenities",
      label: "Amenities",
      options: [
        "Borewell",
        "Electricity Connection",
        "Drip Irrigation",
        "Sprinkler System",
        "Canal / River Water Access",
        "Water Pump Set",
        "Cattle Shed",
        "Motor Shed",
        "Fencing / Boundary Wall",
        "Farmhouse Permission",
        "Solar Power Provision",
        "Levelled Land",
        "Watchman Room",
        "CCTV Surveillance",
      ],
      selectionType: "multiple",
    },
    {
      key: "Posted Since",
      label: "Posted Since",
      options: ["All", "Yesterday", "Last Week", "Last Month", "Last 3 Months"],
    },
  ];
