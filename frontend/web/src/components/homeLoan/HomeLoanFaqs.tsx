"use client";

import React, { useState } from "react";
import { FiChevronDown } from "react-icons/fi";

interface FaqItem {
  question: string;
  answer: string;
}

const homeLoanFaqs: FaqItem[] = [
  {
    question: "How much home loan can I be eligible for?",
    answer:
      "Your home loan eligibility depends on factors such as your monthly income, age, credit score, existing EMIs, loan tenure and property value. Lenders also consider your repayment capacity before deciding the eligible loan amount. The exact amount may vary from one lender to another.",
  },
  {
    question: "What documents are required to apply for a home loan?",
    answer:
      "Common documents include identity proof, address proof, PAN, income proof, recent bank statements and property-related documents such as the sale agreement, title documents and approved building plans. Salaried and self-employed applicants may need different income documents. Additional documents may be required depending on the lender and property.",
  },
  {
    question: "What is the difference between fixed and floating interest rates?",
    answer:
      "A fixed interest rate remains unchanged for the period specified in the loan agreement, giving you greater certainty over repayments. A floating interest rate can change based on the lender’s applicable benchmark and market conditions. When the rate changes, your EMI, loan tenure or both may also change.",
  },
  {
    question: "Can I prepay or foreclose my home loan without penalty?",
    answer:
      "For floating-rate loans given to individual borrowers for non-business purposes, applicable RBI rules generally do not allow lenders to charge foreclosure or prepayment penalties. For fixed-rate loans and other cases, charges, if any, may depend on the lender’s policy and loan terms.",
  },
  {
    question: "What tax benefits can I claim on a home loan?",
    answer:
      "Home loan tax benefits depend on the tax regime you choose and the applicable tax rules. Under the old tax regime, eligible borrowers may claim principal repayment within the overall Section 80C limit of ₹1.5 lakh and interest on an eligible self-occupied property under Section 24(b) up to ₹2 lakh, subject to applicable conditions. These benefits are not available in the same manner under the new tax regime.",
  },
  {
    question: "How long does it take for a home loan to get approved and disbursed?",
    answer:
      "The timeline depends on the lender, applicant profile, document verification and property checks. An initial assessment may be completed relatively quickly, while final approval and disbursement can take longer if legal or technical verification is required. Disbursement takes place after all lender requirements and documentation are completed.",
  },
];

export default function HomeLoanFaqs() {
  const [openIndex, setOpenIndex] = useState<number | null>(0);

  const toggleFaq = (index: number) => {
    setOpenIndex((prev) => (prev === index ? null : index));
  };

  return (
    <section className="w-full border-t border-gray-100 bg-white py-12 sm:py-16">
      <div className="container mx-auto px-4">
        <div className="mx-auto max-w-4xl">
          <div className="mb-8 text-center sm:mb-10">
            <p className="text-sm font-semibold uppercase tracking-[0.16em] text-[#27AE60]">
              Home Loan Guide
            </p>
            <h2 className="mt-3 text-2xl font-semibold tracking-tight text-gray-950 sm:text-3xl">
              Frequently Asked Questions
            </h2>
            <p className="mx-auto mt-3 max-w-2xl text-sm leading-6 text-gray-600 sm:text-base">
              Clear answers to common questions about eligibility, documents, interest rates, prepayment, tax benefits, and approval timelines.
            </p>
          </div>

          <div className="divide-y divide-gray-100 rounded-lg border border-gray-200 bg-white shadow-sm">
            {homeLoanFaqs.map((faq, index) => {
              const isOpen = openIndex === index;
              return (
                <div
                  key={faq.question}
                  className="overflow-hidden"
                >
                  <button
                    type="button"
                    onClick={() => toggleFaq(index)}
                    aria-expanded={isOpen}
                    className="flex w-full items-center gap-4 px-4 py-4 text-left transition hover:bg-gray-50 cursor-pointer sm:px-6 sm:py-5"
                  >
                    <span
                      className={`flex h-8 w-8 shrink-0 items-center justify-center rounded-md text-xs font-semibold ${
                        isOpen
                          ? "bg-[#27AE60] text-white"
                          : "bg-emerald-50 text-[#27AE60]"
                      }`}
                    >
                      {String(index + 1).padStart(2, "0")}
                    </span>
                    <span className="min-w-0 flex-1 text-sm font-semibold leading-6 text-gray-950 sm:text-base">
                      {faq.question}
                    </span>
                    <span
                      className={`flex h-8 w-8 shrink-0 items-center justify-center rounded-md text-gray-500 transition-transform duration-200 ${
                        isOpen ? "rotate-180" : ""
                      }`}
                    >
                      <FiChevronDown size={18} />
                    </span>
                  </button>

                  {isOpen && (
                    <div className="px-4 pb-5 sm:px-6">
                      <p className="pl-12 text-sm leading-7 text-gray-600">
                        {faq.answer}
                      </p>
                    </div>
                  )}
                </div>
              );
            })}
          </div>
        </div>
      </div>
    </section>
  );
}
