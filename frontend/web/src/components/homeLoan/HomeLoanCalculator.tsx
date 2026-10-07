"use client";

import React, { useEffect, useMemo, useState } from "react";
import HomeLoanApplyDialog from "./HomeLoanApplyDialog";

export type CalculatorTab = "eligibility" | "emi";

interface HomeLoanCalculatorProps {
  initialTab?: CalculatorTab;
}

const EMI_LOAN_AMOUNT_MIN = 2000000;
const EMI_LOAN_AMOUNT_MAX = 50000000;
const EMI_LOAN_AMOUNT_STEP = 100000;

export default function HomeLoanCalculator({
  initialTab = "emi",
}: HomeLoanCalculatorProps) {
  const [activeTab, setActiveTab] = useState<CalculatorTab>(initialTab);
  const [isApplyModalOpen, setIsApplyModalOpen] = useState(false);

  useEffect(() => {
    const handleTabChange = (event: Event) => {
      const { detail } = event as CustomEvent<CalculatorTab>;
      if (detail === "eligibility" || detail === "emi") {
        setActiveTab(detail);
      }
    };

    window.addEventListener("home-loan-calculator-tab", handleTabChange);
    return () => {
      window.removeEventListener("home-loan-calculator-tab", handleTabChange);
    };
  }, []);

  // -------------------------------------------------------------
  // Tab 1: Eligibility State
  // -------------------------------------------------------------
  const [monthlyIncome, setMonthlyIncome] = useState<number>(100000); // Net monthly income
  const [existingEmis, setExistingEmis] = useState<number>(10000); // Existing EMIs
  const [eligibilityTenure, setEligibilityTenure] = useState<number>(20); // Years
  const [eligibilityRate, setEligibilityRate] = useState<number>(8.5); // % p.a.

  // -------------------------------------------------------------
  // Tab 2: EMI Calculator State
  // -------------------------------------------------------------
  const [loanAmount, setLoanAmount] = useState<number>(EMI_LOAN_AMOUNT_MIN); // Loan amount in INR
  const [emiRate, setEmiRate] = useState<number>(7); // % p.a.
  const [emiTenure, setEmiTenure] = useState<number>(10); // Years

  // -------------------------------------------------------------
  // Eligibility Calculations
  // Standard banking FOIR (Fixed Obligation to Income Ratio) = 50%
  // -------------------------------------------------------------
  const { maxEligibleLoan, eligibleMonthlyEmi } = useMemo(() => {
    // 50% - 60% FOIR benchmark on monthly income
    const foirRatio = monthlyIncome > 100000 ? 0.6 : 0.5;
    const maxAllowedEmi = monthlyIncome * foirRatio;
    const availableEmi = Math.max(0, maxAllowedEmi - existingEmis);

    if (availableEmi <= 0 || eligibilityTenure <= 0 || eligibilityRate <= 0) {
      return { maxEligibleLoan: 0, eligibleMonthlyEmi: 0 };
    }

    const r = eligibilityRate / 12 / 100;
    const n = eligibilityTenure * 12;

    // Present Value of annuity formula:
    // P = E * [ (1+r)^n - 1 ] / [ r * (1+r)^n ]
    const p = (availableEmi * (Math.pow(1 + r, n) - 1)) / (r * Math.pow(1 + r, n));

    return {
      maxEligibleLoan: Math.round(p),
      eligibleMonthlyEmi: Math.round(availableEmi),
    };
  }, [monthlyIncome, existingEmis, eligibilityTenure, eligibilityRate]);

  // -------------------------------------------------------------
  // EMI Calculator Calculations
  // -------------------------------------------------------------
  const { calculatedEmi, totalInterest, totalPayment } = useMemo(() => {
    if (loanAmount <= 0 || emiTenure <= 0 || emiRate <= 0) {
      return { calculatedEmi: 0, totalInterest: 0, totalPayment: 0 };
    }

    const r = emiRate / 12 / 100;
    const n = emiTenure * 12;

    // Standard EMI formula:
    // E = P * r * (1+r)^n / [ (1+r)^n - 1 ]
    const emi =
      (loanAmount * r * Math.pow(1 + r, n)) / (Math.pow(1 + r, n) - 1);

    const total = emi * n;
    const interest = total - loanAmount;

    return {
      calculatedEmi: Math.round(emi),
      totalInterest: Math.round(interest),
      totalPayment: Math.round(total),
    };
  }, [loanAmount, emiTenure, emiRate]);

  // Donut chart calculations
  const donutRadius = 66;
  const donutCircumference = 2 * Math.PI * donutRadius;
  const principalRatio =
    totalPayment > 0 ? Math.min(1, Math.max(0, loanAmount / totalPayment)) : 0.5;
  const principalDasharray = `${principalRatio * donutCircumference} ${donutCircumference}`;

  // Helper for Indian Currency formatting
  const formatINR = (val: number) => {
    return val.toLocaleString("en-IN");
  };

  // Helper for slider fill percentage with brand primary color
  const getTrackBackground = (value: number, min: number, max: number) => {
    const percent = Math.min(
      100,
      Math.max(0, ((value - min) / (max - min)) * 100)
    );
    return `linear-gradient(to right, #27AE60 ${percent}%, #E5E7EB ${percent}%)`;
  };

  return (
    <section id="calculator" className="w-full py-12 sm:py-16 bg-white">
      <div className="container mx-auto">
        {/* Tab Buttons */}
        <div className="flex flex-wrap items-center gap-3 mb-8">
          <button
            type="button"
            onClick={() => setActiveTab("emi")}
            className={`px-6 py-2.5 rounded-full text-sm font-semibold transition-all duration-200 cursor-pointer ${activeTab === "emi"
              ? "bg-[#27AE60] text-white shadow-xs"
              : "bg-gray-100 text-gray-700 hover:bg-gray-200/80"
              }`}
          >
            Home Loan EMI Calculator
          </button>
          <button
            type="button"
            onClick={() => setActiveTab("eligibility")}
            className={`px-6 py-2.5 rounded-full text-sm font-semibold transition-all duration-200 cursor-pointer ${activeTab === "eligibility"
              ? "bg-[#27AE60] text-white shadow-xs"
              : "bg-gray-100 text-gray-700 hover:bg-gray-200/80"
              }`}
          >
            Home Loan Eligibility Calculator
          </button>
        </div>

        {/* Main Calculator Card */}
        <div className="rounded-md bg-[#F5fffc] p-6 sm:p-10 shadow-[0_4px_25px_rgb(0,0,0,0.04)]">
          <div className="grid grid-cols-1 gap-8 lg:grid-cols-12 lg:gap-10 items-stretch">
            {/* -------------------------------------------------------- */}
            {/* LEFT COLUMN: Input Sliders                               */}
            {/* -------------------------------------------------------- */}
            <div className="lg:col-span-7 flex flex-col gap-4 sm:gap-5">
              {/* Header Title */}
              <h2 className="text-2xl sm:text-3xl text-gray-900 mb-2 sm:mb-3 tracking-tight font-semibold">
                {activeTab === "eligibility"
                  ? "Calculate Your Home Loan Eligibility"
                  : "Calculate Your Home Loan EMI"}
              </h2>
              {activeTab === "eligibility" ? (
                <>
                  {/* 1. Net Monthly Income */}
                  <div>
                    <div className="flex items-center justify-between">
                      <label
                        htmlFor="monthly-income"
                        className="text-sm sm:text-base font-semibold text-gray-800"
                      >
                        Net Monthly Income
                      </label>
                      <div className="flex items-center gap-1.5 rounded-md border border-gray-200 bg-gray-50/80 px-3.5 py-1.5 focus-within:border-[#27AE60] focus-within:bg-white transition-colors">
                        <span className="text-gray-500 text-sm font-medium">₹</span>
                        <input
                          id="monthly-income"
                          type="text"
                          inputMode="numeric"
                          value={formatINR(monthlyIncome)}
                          onChange={(e) => {
                            const val = Number(e.target.value.replace(/[^0-9]/g, ""));
                            setMonthlyIncome(Math.min(val, 10000000));
                          }}
                          className="w-24 sm:w-28 text-right font-semibold text-gray-900 text-sm sm:text-base bg-transparent outline-none"
                        />
                      </div>
                    </div>
                    <input
                      type="range"
                      min={10000}
                      max={500000}
                      step={5000}
                      value={monthlyIncome}
                      onChange={(e) => setMonthlyIncome(Number(e.target.value))}
                      style={{
                        background: getTrackBackground(monthlyIncome, 10000, 500000),
                      }}
                      className="calculator-slider"
                    />
                    <div className="flex justify-between text-xs font-medium text-gray-400 mt-1.5">
                      <span>10K</span>
                      <span>5L</span>
                    </div>
                  </div>

                  {/* 2. Existing EMIs */}
                  <div>
                    <div className="flex items-center justify-between">
                      <label
                        htmlFor="existing-emis"
                        className="text-sm sm:text-base font-semibold text-gray-800"
                      >
                        Existing EMIs
                      </label>
                      <div className="flex items-center gap-1.5 rounded-md border border-gray-200 bg-gray-50/80 px-3.5 py-1.5 focus-within:border-[#27AE60] focus-within:bg-white transition-colors">
                        <span className="text-gray-500 text-sm font-medium">₹</span>
                        <input
                          id="existing-emis"
                          type="text"
                          inputMode="numeric"
                          value={formatINR(existingEmis)}
                          onChange={(e) => {
                            const val = Number(e.target.value.replace(/[^0-9]/g, ""));
                            setExistingEmis(Math.min(val, 10000000));
                          }}
                          className="w-24 sm:w-28 text-right font-semibold text-gray-900 text-sm sm:text-base bg-transparent outline-none"
                        />
                      </div>
                    </div>
                    <input
                      type="range"
                      min={0}
                      max={500000}
                      step={2500}
                      value={existingEmis}
                      onChange={(e) => setExistingEmis(Number(e.target.value))}
                      style={{
                        background: getTrackBackground(existingEmis, 0, 500000),
                      }}
                      className="calculator-slider"
                    />
                    <div className="flex justify-between text-xs font-medium text-gray-400 mt-1.5">
                      <span>0</span>
                      <span>5L</span>
                    </div>
                  </div>

                  {/* 3. Loan Tenure (Years) */}
                  <div>
                    <div className="flex items-center justify-between">
                      <label
                        htmlFor="eligibility-tenure"
                        className="text-sm sm:text-base font-semibold text-gray-800"
                      >
                        Loan Tenure(Years)
                      </label>
                      <div className="flex items-center gap-1.5 rounded-md border border-gray-200 bg-gray-50/80 px-3.5 py-1.5 focus-within:border-[#27AE60] focus-within:bg-white transition-colors">
                        <input
                          id="eligibility-tenure"
                          type="number"
                          min={1}
                          max={30}
                          value={eligibilityTenure}
                          onChange={(e) => {
                            const val = Number(e.target.value);
                            setEligibilityTenure(Math.min(30, Math.max(1, val || 1)));
                          }}
                          className="w-10 text-right font-semibold text-gray-900 text-sm sm:text-base bg-transparent outline-none"
                        />
                        <span className="text-gray-500 text-sm font-medium">Years</span>
                      </div>
                    </div>
                    <input
                      type="range"
                      min={1}
                      max={30}
                      step={1}
                      value={eligibilityTenure}
                      onChange={(e) => setEligibilityTenure(Number(e.target.value))}
                      style={{
                        background: getTrackBackground(eligibilityTenure, 1, 30),
                      }}
                      className="calculator-slider"
                    />
                    <div className="flex justify-between text-xs font-medium text-gray-400 mt-1.5">
                      <span>1 Year</span>
                      <span>30 Year</span>
                    </div>
                  </div>

                  {/* 4. Interest Rate% (p.a.) */}
                  <div>
                    <div className="flex items-center justify-between">
                      <label
                        htmlFor="eligibility-rate"
                        className="text-sm sm:text-base font-semibold text-gray-800"
                      >
                        Interest Rate% (p.a.)
                      </label>
                      <div className="flex items-center gap-1.5 rounded-md border border-gray-200 bg-gray-50/80 px-3.5 py-1.5 focus-within:border-[#27AE60] focus-within:bg-white transition-colors">
                        <input
                          id="eligibility-rate"
                          type="number"
                          step={0.1}
                          min={5}
                          max={15}
                          value={eligibilityRate}
                          onChange={(e) => {
                            const val = Number(e.target.value);
                            setEligibilityRate(Math.min(15, Math.max(5, val || 5)));
                          }}
                          className="w-12 text-right font-semibold text-gray-900 text-sm sm:text-base bg-transparent outline-none"
                        />
                        <span className="text-gray-500 text-sm font-medium">%</span>
                      </div>
                    </div>
                    <input
                      type="range"
                      min={5}
                      max={15}
                      step={0.1}
                      value={eligibilityRate}
                      onChange={(e) => setEligibilityRate(Number(e.target.value))}
                      style={{
                        background: getTrackBackground(eligibilityRate, 5, 15),
                      }}
                      className="calculator-slider"
                    />
                    <div className="flex justify-between text-xs font-medium text-gray-400 mt-1.5">
                      <span>5</span>
                      <span>15</span>
                    </div>
                  </div>
                </>
              ) : (
                <>
                  {/* 1. Loan Amount */}
                  <div>
                    <div className="flex items-center justify-between">
                      <label
                        htmlFor="loan-amount"
                        className="text-sm sm:text-base font-semibold text-gray-800"
                      >
                        Loan Amount
                      </label>
                      <div className="flex items-center gap-1.5 rounded-md border border-gray-200 bg-gray-50/80 px-3.5 py-1.5 focus-within:border-[#27AE60] focus-within:bg-white transition-colors">
                        <span className="text-gray-500 text-sm font-medium">₹</span>
                        <input
                          id="loan-amount"
                          type="text"
                          inputMode="numeric"
                          value={formatINR(loanAmount)}
                          onChange={(e) => {
                            const val = Number(e.target.value.replace(/[^0-9]/g, ""));
                            setLoanAmount(
                              Math.min(
                                EMI_LOAN_AMOUNT_MAX,
                                Math.max(EMI_LOAN_AMOUNT_MIN, val || EMI_LOAN_AMOUNT_MIN),
                              ),
                            );
                          }}
                          className="w-24 sm:w-28 text-right font-semibold text-gray-900 text-sm sm:text-base bg-transparent outline-none"
                        />
                      </div>
                    </div>
                    <input
                      type="range"
                      min={EMI_LOAN_AMOUNT_MIN}
                      max={EMI_LOAN_AMOUNT_MAX}
                      step={EMI_LOAN_AMOUNT_STEP}
                      value={loanAmount}
                      onChange={(e) => setLoanAmount(Number(e.target.value))}
                      style={{
                        background: getTrackBackground(
                          loanAmount,
                          EMI_LOAN_AMOUNT_MIN,
                          EMI_LOAN_AMOUNT_MAX,
                        ),
                      }}
                      className="calculator-slider"
                    />
                    <div className="flex justify-between text-xs font-medium text-gray-400 mt-1.5">
                      <span>20L</span>
                      <span>5Cr</span>
                    </div>
                  </div>

                  {/* 2. Interest Rate% (p.a.) */}
                  <div>
                    <div className="flex items-center justify-between">
                      <label
                        htmlFor="emi-rate"
                        className="text-sm sm:text-base font-semibold text-gray-800"
                      >
                        Interest Rate% (p.a.)
                      </label>
                      <div className="flex items-center gap-1.5 rounded-md border border-gray-200 bg-gray-50/80 px-3.5 py-1.5 focus-within:border-[#27AE60] focus-within:bg-white transition-colors">
                        <input
                          id="emi-rate"
                          type="number"
                          step={0.1}
                          min={5}
                          max={22}
                          value={emiRate}
                          onChange={(e) => {
                            const val = Number(e.target.value);
                            setEmiRate(Math.min(22, Math.max(5, val || 5)));
                          }}
                          className="w-12 text-right font-semibold text-gray-900 text-sm sm:text-base bg-transparent outline-none"
                        />
                        <span className="text-gray-500 text-sm font-medium">%</span>
                      </div>
                    </div>
                    <input
                      type="range"
                      min={5}
                      max={22}
                      step={0.1}
                      value={emiRate}
                      onChange={(e) => setEmiRate(Number(e.target.value))}
                      style={{
                        background: getTrackBackground(emiRate, 5, 22),
                      }}
                      className="calculator-slider"
                    />
                    <div className="flex justify-between text-xs font-medium text-gray-400 mt-1.5">
                      <span>5%</span>
                      <span>22%</span>
                    </div>
                  </div>

                  {/* 3. Loan Tenure */}
                  <div>
                    <div className="flex items-center justify-between">
                      <label
                        htmlFor="emi-tenure"
                        className="text-sm sm:text-base font-semibold text-gray-800"
                      >
                        Loan Tenure
                      </label>
                      <div className="flex items-center gap-1.5 rounded-md border border-gray-200 bg-gray-50/80 px-3.5 py-1.5 focus-within:border-[#27AE60] focus-within:bg-white transition-colors">
                        <input
                          id="emi-tenure"
                          type="number"
                          min={1}
                          max={30}
                          value={emiTenure}
                          onChange={(e) => {
                            const val = Number(e.target.value);
                            setEmiTenure(Math.min(30, Math.max(1, val || 1)));
                          }}
                          className="w-10 text-right font-semibold text-gray-900 text-sm sm:text-base bg-transparent outline-none"
                        />
                        <span className="text-gray-500 text-sm font-medium">Years</span>
                      </div>
                    </div>
                    <input
                      type="range"
                      min={1}
                      max={30}
                      step={1}
                      value={emiTenure}
                      onChange={(e) => setEmiTenure(Number(e.target.value))}
                      style={{
                        background: getTrackBackground(emiTenure, 1, 30),
                      }}
                      className="calculator-slider"
                    />
                    <div className="flex justify-between text-xs font-medium text-gray-400 mt-1.5">
                      <span>1 Year</span>
                      <span>30 Year</span>
                    </div>
                  </div>

                  {/* Your EMI Card (Only in EMI Mode) */}
                  <div className="mt-3 rounded-xl bg-white border border-gray-200/80 px-6 py-4 flex items-center shadow-xs">
                    <span className="text-base sm:text-lg font-semibold text-gray-900">
                      Your EMI
                    </span>
                    <span className="text-2xl sm:text-3xl font-bold text-[#27AE60] ml-3 tracking-tight">
                      ₹ {formatINR(calculatedEmi)}
                    </span>
                  </div>
                </>
              )}
            </div>

            {/* -------------------------------------------------------- */}
            {/* RIGHT COLUMN: Results Display Card                       */}
            {/* -------------------------------------------------------- */}
            <div className="lg:col-span-5 flex flex-col h-full">
              <div className="relative h-full rounded-md bg-[#F0FDF4] p-6 sm:p-8 flex flex-col justify-between overflow-hidden border border-emerald-100/70 shadow-xs">
                {/* Subtle curved background ornament */}
                <div className="pointer-events-none absolute -bottom-16 -right-16 w-60 h-60 rounded-full bg-emerald-200/40 blur-3xl" />
                <div className="pointer-events-none absolute -top-12 -left-12 w-48 h-48 rounded-full bg-white/60 blur-2xl" />

                <div className="relative z-10">
                  {activeTab === "eligibility" ? (
                    <div className="space-y-6 sm:space-y-8">
                      {/* Section 1: Loan Eligibility */}
                      <div>
                        <h3 className="text-base sm:text-lg font-semibold text-gray-800">
                          Your Home Loan Eligibility
                        </h3>
                        <div className="mt-2 text-3xl sm:text-4xl lg:text-[40px] font-semibold text-[#27AE60] tracking-tight">
                          ₹ {formatINR(maxEligibleLoan)}
                        </div>
                      </div>

                      {/* Section 2: EMI will be */}
                      <div>
                        <h3 className="text-base sm:text-lg font-semibold text-gray-800">
                          Your Home Loan EMI will be
                        </h3>
                        <div className="mt-2 flex items-baseline gap-1 text-3xl sm:text-4xl font-semibold text-[#27AE60] tracking-tight">
                          <span>₹ {formatINR(eligibleMonthlyEmi)}</span>
                          <span className="text-sm sm:text-base font-medium text-[#27AE60]/85">
                            /monthly
                          </span>
                        </div>
                      </div>

                      {existingEmis > monthlyIncome * 0.6 && (
                        <p className="text-xs text-amber-600 bg-amber-50 p-2.5 rounded-lg border border-amber-200/60">
                          Notice: Existing EMIs exceed typical debt-to-income limits. Consider lowering existing debt to increase loan eligibility.
                        </p>
                      )}
                    </div>
                  ) : (
                    <div>
                      {/* EMI Tab Donut Chart */}
                      <div className="relative w-42 h-42 sm:w-50 sm:h-50 mx-auto flex items-center justify-center my-1">
                        <svg
                          className="w-full h-full -rotate-90"
                          viewBox="0 0 160 160"
                        >
                          {/* Background Ring: Interest Amount */}
                          <circle
                            cx="80"
                            cy="80"
                            r={donutRadius}
                            className="text-emerald-300"
                            stroke="currentColor"
                            strokeWidth="11"
                            fill="transparent"
                          />
                          {/* Foreground Ring: Principal Amount */}
                          <circle
                            cx="80"
                            cy="80"
                            r={donutRadius}
                            className="text-[#27AE60] transition-all duration-300"
                            stroke="currentColor"
                            strokeWidth="11"
                            strokeDasharray={principalDasharray}
                            strokeDashoffset={0}
                            fill="transparent"
                          />
                        </svg>

                        {/* Center Text inside Donut */}
                        <div className="absolute inset-0 flex flex-col items-center justify-center text-center p-3 pointer-events-none">
                          <span className="text-[10px] sm:text-[12px] font-medium text-gray-500 leading-tight max-w-[85%]">
                            Total Amount Payable
                          </span>
                          <span className="text-sm sm:text-base font-semibold text-gray-900 mt-1 tracking-tight">
                            ₹ {formatINR(totalPayment)}
                          </span>
                        </div>
                      </div>

                      {/* Legend below Donut Chart */}
                      <div className="grid grid-cols-2 gap-4 mt-6 pt-5 border-t border-emerald-200/50 text-center">
                        <div className="flex flex-col items-center justify-center">
                          <div className="flex items-center justify-center gap-2">
                            <span className="w-3.5 h-3.5 rounded-[3px] bg-[#27AE60] shrink-0" />
                            <span className="text-xs sm:text-sm text-gray-600 font-medium">
                              Principal Amount
                            </span>
                          </div>
                          <p className="text-base sm:text-lg font-semibold text-gray-900 mt-1">
                            ₹ {formatINR(loanAmount)}
                          </p>
                        </div>
                        <div className="flex flex-col items-center justify-center">
                          <div className="flex items-center justify-center gap-2">
                            <span className="w-3.5 h-3.5 rounded-[3px] bg-emerald-300 shrink-0" />
                            <span className="text-xs sm:text-sm text-gray-600 font-medium">
                              Interest Amount
                            </span>
                          </div>
                          <p className="text-base sm:text-lg font-semibold text-gray-900 mt-1">
                            ₹ {formatINR(totalInterest)}
                          </p>
                        </div>
                      </div>
                    </div>
                  )}
                </div>

                {/* Bottom Action Button(s) */}
                <div className="relative z-10 mt-6">
                  {activeTab === "eligibility" ? (
                    <div className="flex flex-col sm:flex-row items-center gap-3">
                      <button
                        type="button"
                        onClick={() => setIsApplyModalOpen(true)}
                        className="w-full sm:flex-1 py-2.5 px-3 rounded-lg bg-[#27AE60] hover:bg-[#219653] text-white font-medium text-sm sm:text-base text-center shadow-xs hover:shadow transition-all duration-200 active:scale-[0.98] cursor-pointer"
                      >
                        Apply Now
                      </button>
                      <button
                        type="button"
                        className="w-full sm:flex-1 py-2.5 px-3 rounded-lg border border-[#27AE60] text-[#27AE60] hover:bg-[#27AE60]/8 font-medium text-sm sm:text-base text-center transition-all duration-200 active:scale-[0.98] cursor-pointer bg-white"
                      >
                        Get Callback
                      </button>
                    </div>
                  ) : (
                    <button
                      type="button"
                      onClick={() => setIsApplyModalOpen(true)}
                      className="w-full py-2.5 px-3 rounded-lg bg-[#27AE60] hover:bg-[#219653] text-white font-medium text-sm sm:text-base text-center shadow-xs hover:shadow transition-all duration-200 active:scale-[0.98] cursor-pointer"
                    >
                      Talk to a Loan Advisor
                    </button>
                  )}
                </div>
              </div>
            </div>
          </div>
        </div>

        {/* Disclaimer Text */}
        <p className="mt-6 text-xs sm:text-sm text-gray-400">
          These results are estimates for guidance only and may not match your exact
          financial offer. Please verify all final terms and rates directly with
          your lender. Rates can change at any time, and Propenu accepts no
          liability for decisions made using these tools.
        </p>
      </div>

      <HomeLoanApplyDialog
        isOpen={isApplyModalOpen}
        onClose={() => setIsApplyModalOpen(false)}
        titleId="calculator-apply-loan-title"
        metadata={{
          sourceSection: "calculator",
          calculator: activeTab === "eligibility"
            ? {
                type: "eligibility",
                monthlyIncome,
                existingEmis,
                tenureYears: eligibilityTenure,
                interestRate: eligibilityRate,
                maxEligibleLoan,
                eligibleMonthlyEmi,
              }
            : {
                type: "emi",
                loanAmount,
                interestRate: emiRate,
                tenureYears: emiTenure,
                calculatedEmi,
                totalInterest,
                totalPayment,
              },
          attribution: {
            sourceSection: "calculator",
            activeTab,
          },
        }}
      />
    </section>
  );
}
