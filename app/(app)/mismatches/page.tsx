"use client";

import { useState, useEffect } from "react";
import { createClient } from "@/lib/supabase/client";
import { FIELD_LABEL } from "@/lib/mock/data";
import { ComparisonView } from "@/app/(app)/batches/comparison-view";
import type { Field } from "@/lib/types";

export default function MismatchesPage() {
  const [mismatches, setMismatches] = useState<any[]>([]);
  const [selectedId, setSelectedId] = useState<string | null>(null);
  const [activeTab, setActiveTab] = useState<"analysis" | "email" | "attachments">("analysis");
  const [searchQuery, setSearchQuery] = useState("");
  const [emailSentMap, setEmailSentMap] = useState<Record<string, boolean>>({});
  
  // New State for Bulk Actions & Preview
  const [selectedEmails, setSelectedEmails] = useState<string[]>([]);
  const [showPreview, setShowPreview] = useState(false);

  // Fetch mismatch records from Supabase
  useEffect(() => {
    async function loadMismatches() {
      const supabase = createClient();
      const { data } = await supabase
        .from("processed_emails")
        .select("*")
        .eq("status", "MISMATCH");

      if (data && data.length > 0) {
        setMismatches(data);
        setSelectedId(data[0].email_id); // Default select first email
      }
    }
    loadMismatches();
  }, []);

  const rawSelectedEmail = mismatches.find((m) => m.email_id === selectedId);

  // Map your database column names (defect_fields) to match your teammate's component (defectFields)
  const selectedEmail = rawSelectedEmail ? {
    ...rawSelectedEmail,
    id: rawSelectedEmail.email_id,
    defectFields: rawSelectedEmail.defect_fields || [],
    fields: rawSelectedEmail.fields || [],
    attachments: rawSelectedEmail.attachments || [],
    confidence: rawSelectedEmail.confidence || 0,
    classificationConfidence: rawSelectedEmail.classificationConfidence || 0,
    result: rawSelectedEmail.result || "mismatch",
  } : null;

  // Single Email Action
  const handleSendEmail = (id: string) => {
    setEmailSentMap((prev) => ({ ...prev, [id]: true }));
    alert("Email sent successfully!");
  };

  // Bulk Actions
  const handleToggleSelect = (id: string, e: React.MouseEvent<HTMLInputElement>) => {
    e.stopPropagation();
    setSelectedEmails((prev) =>
      prev.includes(id) ? prev.filter((emailId) => emailId !== id) : [...prev, id]
    );
  };

  const handleSelectAll = (e: React.ChangeEvent<HTMLInputElement>) => {
    if (e.target.checked) {
      setSelectedEmails(mismatches.map((m) => m.email_id));
    } else {
      setSelectedEmails([]);
    }
  };

  const handleEmailSelected = () => {
    if (selectedEmails.length === 0) return alert("No emails selected!");
    const nextMap = { ...emailSentMap };
    selectedEmails.forEach((id) => (nextMap[id] = true));
    setEmailSentMap(nextMap);
    alert(`Successfully sent ${selectedEmails.length} emails!`);
    setSelectedEmails([]); // Clear selection after sending
  };

  const handleEmailAllMismatch = () => {
    if (mismatches.length === 0) return alert("No mismatches to email.");
    const nextMap = { ...emailSentMap };
    mismatches.forEach((m) => (nextMap[m.email_id] = true));
    setEmailSentMap(nextMap);
    alert(`Successfully sent all ${mismatches.length} emails!`);
  };

  return (
    <div className="p-6 max-w-[1600px] mx-auto text-gray-800">
      {/* Top Filter Bar & Search */}
      <div className="flex flex-col xl:flex-row justify-between xl:items-center gap-4 mb-6">
        <div className="flex gap-4 items-center w-full xl:w-auto">
          <div className="inline-flex rounded-md border border-gray-200 overflow-hidden bg-white h-10 shrink-0">
            <button className="px-4 py-2 text-sm font-medium text-gray-700 hover:bg-gray-50 border-r border-gray-200">
              All {mismatches.length}
            </button>
            <button className="px-4 py-2 text-sm font-medium bg-[#1e293b] text-white">
              Mismatches {mismatches.length}
            </button>
          </div>

          <div className="relative flex-grow xl:w-80">
            <input
              type="text"
              placeholder="Search subject or sender"
              value={searchQuery}
              onChange={(e) => setSearchQuery(e.target.value)}
              className="w-full pl-10 pr-4 h-10 border border-gray-200 rounded-md text-sm focus:outline-none focus:ring-1 focus:ring-slate-900 bg-white"
            />
            <svg
              className="w-4 h-4 text-gray-400 absolute left-3 top-3"
              fill="none"
              stroke="currentColor"
              viewBox="0 0 24 24"
            >
              <path strokeLinecap="round" strokeLinejoin="round" strokeWidth="2" d="21 21l-6-6m2-5a7 7 0 11-14 0 7 7 0 0114 0z" />
            </svg>
          </div>
        </div>

        {/* Bulk Action Buttons */}
        <div className="flex gap-2 flex-wrap">
          <button
            onClick={() => setShowPreview(true)}
            className="px-4 py-2 border border-gray-300 bg-white text-gray-700 rounded-md text-sm font-medium hover:bg-gray-50 transition shadow-sm"
          >
            Preview Email
          </button>
          <button
            onClick={handleEmailSelected}
            disabled={selectedEmails.length === 0}
            className={`px-4 py-2 rounded-md text-sm font-medium transition shadow-sm border ${
              selectedEmails.length > 0
                ? "bg-white border-gray-300 text-gray-900 hover:bg-gray-50"
                : "bg-gray-50 border-gray-200 text-gray-400 cursor-not-allowed"
            }`}
          >
            Email Selected ({selectedEmails.length})
          </button>
          <button
            onClick={handleEmailAllMismatch}
            className="px-4 py-2 bg-[#1e293b] text-white rounded-md text-sm font-medium hover:bg-slate-800 transition shadow-sm"
          >
            Email All Mismatches
          </button>
        </div>
      </div>

      {/* Two-Column Master-Detail View */}
      <div className="grid grid-cols-12 gap-8">
        {/* Left List Column */}
        <div className="col-span-12 lg:col-span-4 flex flex-col h-[calc(100vh-140px)]">
          <div className="flex justify-between items-center pb-3 border-b border-gray-200">
            <div className="flex items-center gap-3">
              <input
                type="checkbox"
                checked={selectedEmails.length === mismatches.length && mismatches.length > 0}
                onChange={handleSelectAll}
                className="w-4 h-4 rounded border-gray-300 text-slate-900 focus:ring-slate-900 cursor-pointer"
              />
              <span className="text-sm font-bold text-gray-900">{mismatches.length} emails</span>
            </div>
            <span className="text-xs text-gray-500 cursor-pointer">↑↓ Newest first</span>
          </div>

          <div className="overflow-y-auto flex-grow bg-white border border-gray-200 border-t-0 rounded-b-lg">
            {mismatches.map((item) => {
              const isSelected = item.email_id === selectedId;
              const isChecked = selectedEmails.includes(item.email_id);
              const isSent = emailSentMap[item.email_id] || item.email_sent;

              return (
                <div
                  key={item.email_id}
                  onClick={() => setSelectedId(item.email_id)}
                  className={`p-4 border-b border-gray-100 cursor-pointer transition-colors ${
                    isSelected
                      ? "border-l-4 border-l-orange-500 bg-orange-50/40"
                      : "border-l-4 border-l-transparent hover:bg-gray-50"
                  }`}
                >
                  <div className="flex items-start gap-3 mb-1">
                    <div className="pt-0.5">
                      <input
                        type="checkbox"
                        checked={isChecked}
                        onClick={(e) => handleToggleSelect(item.email_id, e)}
                        onChange={() => {}} // handled by onClick
                        className="w-4 h-4 rounded border-gray-300 text-slate-900 focus:ring-slate-900 cursor-pointer"
                      />
                    </div>
                    <div className="flex-grow min-w-0">
                      <div className="flex justify-between items-start gap-2">
                        <h3 className="font-semibold text-sm text-gray-900 leading-tight truncate">
                          {item.subject || `Email ID: ${item.email_id.substring(0, 8)}...`}
                        </h3>
                        <span className="text-xs text-gray-400 whitespace-nowrap">
                          {new Date(item.created_at).toLocaleTimeString([], { hour: '2-digit', minute: '2-digit' })}
                        </span>
                      </div>

                      <p className="text-xs text-gray-500 mb-3 truncate mt-1">
                        {item.sender || "client@company.com"}
                      </p>

                      <div className="flex flex-wrap gap-2 items-center">
                        <span className="bg-amber-50 text-amber-700 px-2 py-0.5 rounded text-[11px] font-medium border border-amber-100">
                          Document comparison
                        </span>

                        <span className={`px-2 py-0.5 rounded text-[11px] font-medium flex items-center gap-1 border ${
                          isSent
                            ? "bg-emerald-50 text-emerald-700 border-emerald-100"
                            : "bg-red-50 text-red-700 border-red-100"
                        }`}>
                          <span>⚠️</span>
                          {isSent ? "Email Sent" : "Mismatch found"}
                        </span>
                      </div>
                    </div>
                  </div>
                </div>
              );
            })}

            {mismatches.length === 0 && (
              <div className="p-8 text-center text-gray-500">
                No mismatch cases found.
              </div>
            )}
          </div>
        </div>

        {/* Right Detail Column */}
        <div className="col-span-12 lg:col-span-8 overflow-y-auto h-[calc(100vh-140px)] pb-10">
          {selectedEmail ? (
            <div className="bg-transparent">
              {/* Header */}
              <div className="pb-5 mb-5 border-b border-gray-200">
                <h2 className="text-[1.1rem] font-bold text-gray-900 mb-1 leading-snug">
                  {selectedEmail.subject || `Mismatch Case: ${selectedEmail.id}`}
                </h2>
                <p className="text-xs text-gray-500 mb-4">
                  From <span className="font-medium">{selectedEmail.sender || "client@company.com"}</span> • received {new Date(selectedEmail.created_at).toLocaleString()}
                </p>
                
                <div className="flex gap-2 mb-6">
                  <span className="bg-gray-100 border border-gray-200 text-gray-700 px-2.5 py-1 rounded-md text-xs font-medium">
                    Document comparison
                  </span>
                  <span className="bg-white border border-gray-200 text-gray-700 px-2.5 py-1 rounded-md text-xs font-medium">
                    Processed
                  </span>
                </div>

                <div className="flex gap-3">
                  <button
                    onClick={() => handleSendEmail(selectedEmail.id)}
                    className="border border-gray-300 bg-white text-gray-700 px-4 py-1.5 rounded-md text-sm font-medium hover:bg-gray-50 transition shadow-sm"
                  >
                    {emailSentMap[selectedEmail.id] ? "Resend Email" : "Send Email"}
                  </button>
                  <button type="button" className="bg-[#1e293b] text-white px-4 py-1.5 rounded-md text-sm font-medium hover:bg-slate-800 transition shadow-sm">
                    Export result
                  </button>
                </div>
              </div>

              {/* Sub-Tabs */}
              <div className="flex gap-6 border-b border-gray-200 mb-6 text-sm font-medium text-gray-500">
                <button
                  onClick={() => setActiveTab("analysis")}
                  className={`pb-2 border-b-2 transition ${
                    activeTab === "analysis"
                      ? "border-orange-500 text-gray-900"
                      : "border-transparent hover:text-gray-700"
                  }`}
                >
                  Analysis
                </button>
                <button
                  onClick={() => setActiveTab("email")}
                  className={`pb-2 border-b-2 transition ${
                    activeTab === "email"
                      ? "border-orange-500 text-gray-900"
                      : "border-transparent hover:text-gray-700"
                  }`}
                >
                  Email
                </button>
                <button
                  onClick={() => setActiveTab("attachments")}
                  className={`pb-2 border-b-2 transition ${
                    activeTab === "attachments"
                      ? "border-orange-500 text-gray-900"
                      : "border-transparent hover:text-gray-700"
                  }`}
                >
                  Attachments 2
                </button>
              </div>

              {/* Tab Content */}
              {activeTab === "analysis" && (
                <div className="space-y-6">
                  <ComparisonView email={selectedEmail as any} />
                </div>
              )}

              {activeTab === "email" && (
                <div className="p-5 bg-white rounded-lg border border-gray-200 shadow-sm text-sm">
                  <p className="font-semibold text-gray-900 mb-3">Original Email Body:</p>
                  <p className="text-gray-700 whitespace-pre-line leading-relaxed">
                    {selectedEmail.body || "Hi Team, Attached are the shipping documents for review."}
                  </p>
                </div>
              )}

              {activeTab === "attachments" && (
                <div className="space-y-3">
                  <div className="p-4 bg-white border border-gray-200 rounded-lg flex items-center justify-between text-sm shadow-sm">
                    <span className="font-medium text-gray-700">📄 Bill_of_Lading.pdf</span>
                    <button className="text-blue-600 hover:underline text-xs font-medium">Download</button>
                  </div>
                  <div className="p-4 bg-white border border-gray-200 rounded-lg flex items-center justify-between text-sm shadow-sm">
                    <span className="font-medium text-gray-700">📄 Shipping_Instruction.pdf</span>
                    <button className="text-blue-600 hover:underline text-xs font-medium">Download</button>
                  </div>
                </div>
              )}
            </div>
          ) : (
            <div className="flex items-center justify-center h-full text-gray-400">
              Select an email from the left panel to review details.
            </div>
          )}
        </div>
      </div>

      {/* Preview Modal Overlay */}
      {showPreview && (
        <div className="fixed inset-0 bg-black/60 z-50 flex items-center justify-center p-4">
          <div className="bg-white rounded-xl shadow-xl max-w-2xl w-full flex flex-col max-h-[90vh]">
            <div className="px-6 py-4 border-b border-gray-200 flex justify-between items-center">
              <h3 className="text-lg font-bold text-gray-900">Email Template Preview</h3>
              <button onClick={() => setShowPreview(false)} className="text-gray-400 hover:text-gray-600">
                ✕
              </button>
            </div>
            
            <div className="p-6 overflow-y-auto space-y-4 text-sm text-gray-700">
              <div className="grid grid-cols-[80px_1fr] gap-2 border-b border-gray-100 pb-4">
                <span className="font-medium text-gray-500">To:</span>
                <span>client@company.com</span>
                <span className="font-medium text-gray-500">Subject:</span>
                <span className="font-semibold text-gray-900">Action Required - Document Discrepancy Detected</span>
              </div>
              
              <div className="whitespace-pre-wrap font-mono text-xs bg-gray-50 p-4 rounded-md border border-gray-100">
{`Dear Client,

We have completed the review of your recently submitted shipping documents. 

Our automated document comparison system has identified a discrepancy between your Shipping Instruction and the drafted Bill of Lading.

Please review the attached mismatch report and reply to this email with updated instructions or confirmation to proceed.

Thank you,
Document Verification Team`}
              </div>
            </div>
            
            <div className="px-6 py-4 border-t border-gray-200 bg-gray-50 flex justify-end rounded-b-xl">
              <button 
                onClick={() => setShowPreview(false)} 
                className="px-4 py-2 bg-white border border-gray-300 text-gray-700 rounded-md text-sm font-medium hover:bg-gray-50 transition"
              >
                Close Preview
              </button>
            </div>
          </div>
        </div>
      )}
    </div>
  );
}