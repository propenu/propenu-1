import axios from "axios";

export const LEAD_WHATSAPP_TEMPLATE_BODY = `You have received a new lead for {{2}}.
Name: {{1}}
Phone: {{3}}
Email: {{4}}

Please connect with the lead to understand their property requirements and take the conversation forward.`;

export const LEAD_WHATSAPP_PARAMETER_ORDER = [
  "{{1}} name",
  "{{2}} interestedIn",
  "{{3}} leadPhone",
  "{{4}} email",
] as const;

const sendWhatsAppTemplate = async ({
  phone,
  templateName,
  language,
  parameters,
}: {
  phone: string;
  templateName: string;
  language?: string;
  parameters: string[];
}) => {
  const phoneId = process.env.WHATSAPP_PHONE_NUMBER_ID;
  const token = process.env.WHATSAPP_TOKEN;
  const cleanPhone = phone.replace(/\D/g, "");

  if (!cleanPhone) {
    return null;
  }

  if (!phoneId || !token) {
    console.log(
      `[WhatsApp Template] Env missing. Skipped ${templateName} for ${cleanPhone}`,
    );
    return null;
  }

  const url = `https://graph.facebook.com/v20.0/${phoneId}/messages`;
  const payload = {
    messaging_product: "whatsapp",
    to: cleanPhone,
    type: "template",
    template: {
      name: templateName,
      language: { code: language || process.env.WHATSAPP_TEMPLATE_LANGUAGE || "en" },
      components: [
        {
          type: "body",
          parameters: parameters.map((text) => ({
            type: "text",
            text: String(text || "-"),
          })),
        },
      ],
    },
  };

  const res = await axios.post(url, payload, {
    headers: {
      Authorization: `Bearer ${token}`,
      "Content-Type": "application/json",
    },
  });

  console.log(`[WhatsApp Template] Sent ${templateName} to ${cleanPhone}`);
  return res.data;
};

const buildLeadWhatsAppParameters = (params: {
  leadType?: string;
  name?: string;
  leadPhone?: string;
  email?: string;
  interestedIn?: string;
}) => [
  params.name || "-",
  params.interestedIn || "-",
  params.leadPhone || "-",
  params.email || "Not provided",
];

export async function sendLeadWhatsApp(phone: string, params: {
  leadType?: string;
  name?: string;
  leadPhone?: string;
  email?: string;
  interestedIn?: string;
}) {
  try {
    const templateName = process.env.WHATSAPP_LEAD_TEMPLATE_NAME || "leads_template";
    const language = process.env.WHATSAPP_LEAD_TEMPLATE_LANGUAGE ||
      process.env.WHATSAPP_TEMPLATE_LANGUAGE ||
      "en";
    const parameters = buildLeadWhatsAppParameters(params);

    console.log("[WhatsApp Lead] Sending lead details", {
      to: phone.replace(/\d(?=\d{4})/g, "*"),
      templateName,
      language,
      templateBody: LEAD_WHATSAPP_TEMPLATE_BODY,
      name: parameters[0],
      interestedIn: parameters[1],
      leadPhone: parameters[2],
      email: parameters[3],
    });

    return await sendWhatsAppTemplate({
      phone,
      templateName,
      language,
      parameters,
    });
  } catch (err: any) {
    console.error(
      `[WhatsApp Lead] Failed for ${phone}:`,
      err?.response?.data || err?.message,
    );
    return null;
  }
}

export async function sendOtpWhatsApp(phone: string, otp: string) {
  try {
    const phoneId = process.env.WHATSAPP_PHONE_NUMBER_ID;
    const token = process.env.WHATSAPP_TOKEN;

    if (!phoneId || !token) {
      console.log(`[WhatsApp OTP] Env missing. OTP for ${phone}: ${otp}`);
      return null;
    }
    console.log(`[WhatsApp OTP] Sending OTP for ${phone}: ${otp}`);

    const cleanPhone = phone.replace(/\D/g, "");
    const url = `https://graph.facebook.com/v20.0/${phoneId}/messages`;

    const payload = {
      messaging_product: "whatsapp",
      to: cleanPhone,
      type: "template",
      template: {
        name: "auth_otp",
        language: { code: "en" },
        components: [
          {
            type: "body",
            parameters: [
              {
                type: "text",
                text: otp,
              },
            ],
          },
          {
            type: "button",
            sub_type: "url",
            index: "0",
            parameters: [
              {
                type: "text",
                text: otp,
              },
            ],
          },
        ],
      },
    };

    const res = await axios.post(url, payload, {
      headers: {
        Authorization: `Bearer ${token}`,
        "Content-Type": "application/json",
      },
    });

    console.log(`✅ WhatsApp OTP sent to ${cleanPhone}:`, res.data);
    return res.data;
  } catch (err: any) {
    console.error(
      `❌ WhatsApp OTP failed for ${phone}:`,
      err?.response?.data || err?.message,
    );
    return null;
  }
}
