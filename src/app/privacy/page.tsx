import { Metadata } from "next";
import { PrivacyPage } from "@/components/aqar/PrivacyPage";

export const metadata: Metadata = {
  title: "كيف نحمي خصوصيتك — عقار Match",
  description:
    "شرح مبسّط لنموذج التشفير والمطابقة العمياء في عقار Match. كيف نحمي سعرک السري وميزانيتك ورقم هاتفك بأشياء تفهمها بسهولة.",
  keywords: [
    "خصوصية عقارية",
    "تشفير AES-256",
    "مطابقة عمياء",
    "حماية البيانات",
    "عقار Match",
  ],
};

export default function Page() {
  return <PrivacyPage />;
}
