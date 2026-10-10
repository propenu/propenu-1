"use client";
import FilterDropdown from "@/ui/FilterDropdown";
import { useRouter } from "next/navigation";
import { HiChevronDown } from "react-icons/hi2";
import { useState } from "react";
import Cookies from "js-cookie";
import { MdLogout } from "react-icons/md";

interface UserGreetingProps {
  user?: {
    user?: {
      name?: string;
      roleName?: string;
    };
  };
  onClose?: () => void;
}

export const GreetingOptions = [
  { label: "Account & Settings", link: "/settings" },
  { label: "Notifications", link: "/notifications" },
  { label: "My Properties", link: "/my-properties" },
  { label: "Shortlisted Properties", link: "/shortlisted-properties" },
  { label: "Contacted Properties", link: "/contacted-properties" },
  { label: "Membership", link: "/membership" },
  { label: "Support", link: "/support" },
  { label: "Logout", link: "/logout" },
];

export const AgentOptions = [
  { label: "Dashboard", link: "/agent" },
  { label: "Leads", link: "/agent/leads" },
  { label: "Notifications", link: "/agent/notifications" },
  { label: "My Properties", link: "/agent/my-properties" },
  { label: "Shortlisted Properties", link: "/agent/shortlisted-properties" },
  { label: "My Plans", link: "/agent/my-plan" },
  { label: "Account & Settings", link: "/agent/account-settings" },
  { label: "Support", link: "/agent/support" },
  { label: "Logout", link: "/logout" },
];




export const BuilderOptions = [
  { label: "Dashboard", link: "/builder" },
  { label: "Leads", link: "/builder/leads" },
  { label: "My Projects", link: "/builder/my-projects" },
  { label: "Roles & Team", link: "/builder/roles" },
  // { label: "Relationship Manager", link: "/builder/relationship-manager" },
  { label: "Notifications", link: "/builder/notifications" },
  { label: "Account & Settings", link: "/builder/account-settings" },
  { label: "Support", link: "/builder/support" },
  { label: "Logout", link: "/logout" },
];

export const AdminOptions = [
  { label: "Users", link: "/admin/users" },
  { label: "Logout", link: "/logout" },
];

export const getOptionsForRole = (roleName?: string) => {
  switch (roleName) {
    case "agent":
      return AgentOptions;
    case "builder":
    case "builder_staff":
      return BuilderOptions;
    case "admin":
    case "super_admin":
    case "regional_manager":
      return AdminOptions;
    default:
      return GreetingOptions;
  }
};

const UserGreeting = ({ user, onClose }: UserGreetingProps) => {
  const router = useRouter();
  const [isOpen, setIsOpen] = useState(false);

  const getInitial = (name?: string) => {
    if (!name) return "U";
    return name.charAt(0).toUpperCase();
  };

  const role = user?.user?.roleName;
  const options = getOptionsForRole(role);
  const showRole = role && role !== "user";


  return (
    <div className="text-sm text-gray-700">
      <FilterDropdown
        backdropClassName="fixed inset-0 bg-black/45 z-40 transition-all duration-100"
        triggerLabel={
          <div
            className="flex min-w-0 items-center gap-3 cursor-pointer px-4 py-1"
            onClick={() => setIsOpen(!isOpen)}
          >
            {/* Avatar */}
            <div
              className={`h-9 w-9 shrink-0 rounded-full border border-[#27AE60] text-[#26ad5f] flex items-center justify-center font-semibold text-sm shadow`}
            >
              {getInitial(user?.user?.name)}
            </div>

            {/* Name & Role */}
            <div className="flex min-w-0 flex-1 flex-col items-start">
              <span className="block max-w-full truncate whitespace-nowrap text-sm text-gray-800 capitalize">
                Hi, {user?.user?.name || "User"}
              </span>
              {showRole && (
                <span className="block max-w-full truncate whitespace-nowrap text-xs text-gray-500 capitalize">{role}</span>
              )}
            </div>

            {/* Dropdown Icon */}
            <div className={`shrink-0 text-gray-400 transition-transform duration-300 ${isOpen ? 'rotate-180' : 'rotate-0'}`}>
              <HiChevronDown className="w-4 h-4" />
            </div>
          </div>
        }
        width="w-56"
        align="left"
        showDoneButton={false}
        renderContent={(close) => (
          <div className="py-2">
            {options.map((item) => {
              const isLogout = item.label === "Logout";

              const handleClick = () => {
                if (isLogout) {
                  Cookies.remove("token");

                  close();
                  onClose?.();
                  setIsOpen(false);

                  // 🔥 HARD RELOAD + REDIRECT
                  window.location.href = "/";
                  return;
                }

                if (item.link) {
                  router.push(item.link);
                  close();
                  onClose?.();
                }

                setIsOpen(false);
              };


              return (
                <div key={item.label}>
                  <button
                    type="button"
                    onClick={handleClick}
                    className={`flex w-full items-center justify-between rounded-md px-3 py-2 text-sm transition cursor-pointer ${isLogout ? "text-red-600 hover:bg-red-50 focus:bg-red-50" : "text-gray-700 hover:bg-gray-100 focus:bg-gray-100"}`}
                  >
                    <span>{item.label}</span>

                    {isLogout && (
                      <MdLogout className="h-4 w-4 text-red-500" />
                    )}
                  </button>
                </div>
              );
            })}

          </div>
        )}
      />
    </div>
  );
};

export default UserGreeting;
