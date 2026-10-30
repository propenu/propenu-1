import { createSlice, Draft, PayloadAction } from "@reduxjs/toolkit";
import {
  FilterState,
  ResidentialFilters,
  CommercialFilters,
  LandFilters,
  AgriculturalFilters,
} from "@/types/sharedTypes";

/* ---------------- Types ---------------- */

export type ListingUILabel = "Buy" | "Rent" | "Lease";
export type ListingAPIValue = "sale" | "rent" | "lease";

export type categoryOption =
  | "Residential"
  | "Commercial"
  | "Land"
  | "Agricultural";

/* ---------------- Initial State ---------------- */

const initialState: FilterState = {
  listingTypeLabel: "Buy",
  listingTypeValue: "sale",
  category: "Residential",
  searchText: "",
  minPrice: null,
  maxPrice: null,
  residential: {},
  commercial: {},
  land: {},
  agricultural: {},
};

/* ---------------- Slice ---------------- */
const filterSlice = createSlice({
  name: "filters",
  initialState,
  reducers: {

    /* -------- Core -------- */
    setListingType(
      state,
      action: PayloadAction<{
        label: ListingUILabel;
        value: ListingAPIValue;
      }>,
    ) {
      if (state.listingTypeValue !== action.payload.value) {
        state.minPrice = null;
        state.maxPrice = null;
      }
      state.listingTypeLabel = action.payload.label;
      state.listingTypeValue = action.payload.value;
    },

    setCategory(state, action: PayloadAction<categoryOption>) {
      state.category = action.payload;
    },

    setSearchText(state, action: PayloadAction<string>) {
      state.searchText = action.payload;
    },

    /* -------- Budget -------- */

    setBudget(
      state,
      action: PayloadAction<{ min?: number | null; max?: number | null }>,
    ) {
      const min = action.payload.min ?? null;
      const max = action.payload.max ?? null;
      state.minPrice = min !== null && max !== null && min > max ? max : min;
      state.maxPrice = min !== null && max !== null && min > max ? min : max;
    },

    /* -------- Residential -------- */

    setResidentialFilter<K extends keyof ResidentialFilters>(
      state: Draft<FilterState>,
      action: PayloadAction<{ key: K; value: ResidentialFilters[K] }>,
    ) {
      state.residential[action.payload.key] = action.payload.value;
    },

    /* -------- Commercial -------- */

    setCommercialFilter<K extends keyof CommercialFilters>(
      state: Draft<FilterState>,
      action: PayloadAction<{ key: K; value: CommercialFilters[K] }>,
    ) {
      state.commercial[action.payload.key] = action.payload.value;
    },

    /* -------- Land -------- */

    setLandFilter<K extends keyof LandFilters>(
      state: Draft<FilterState>,
      action: PayloadAction<{ key: K; value: LandFilters[K] }>,
    ) {
      state.land[action.payload.key] = action.payload.value;
    },

    /* -------- Agricultural -------- */

    setAgriculturalFilter<K extends keyof AgriculturalFilters>(
      state: Draft<FilterState>,
      action: PayloadAction<{ key: K; value: AgriculturalFilters[K] }>,
    ) {
      state.agricultural[action.payload.key] = action.payload.value;
    },

    /* -------- Reset Helpers -------- */

    resetResidentialFilters(state) {
      state.residential = {};
    },

    resetCommercialFilters(state) {
      state.commercial = {};
    },

    resetLandFilters(state) {
      state.land = {};
    },

    resetAgriculturalFilters(state) {
      state.agricultural = {};
    },
  },
});

/* ---------------- Exports ---------------- */

export const {
  setListingType,
  setCategory,
  setSearchText,
  setBudget,

  setResidentialFilter,
  setCommercialFilter,
  setLandFilter,
  setAgriculturalFilter,

  resetResidentialFilters,
  resetCommercialFilters,
  resetLandFilters,
  resetAgriculturalFilters,
} = filterSlice.actions;

export default filterSlice.reducer;
