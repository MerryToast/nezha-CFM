import { PublicNoteData, cn, formatBillingAmount, getDaysBetweenDatesWithAutoRenewal } from "@/lib/utils"
import { useTranslation } from "react-i18next"

import RemainPercentBar from "./RemainPercentBar"

export default function BillingInfo({ parsedData }: { parsedData: PublicNoteData }) {
  const { t } = useTranslation()
  if (!parsedData || !parsedData.billingDataMod) {
    return null
  }

  const billingData = parsedData.billingDataMod
  const isFree = billingData.amount === "-1" || billingData.amount === "0"
  const hasPrice = Boolean(billingData.amount && !isFree)
  const billingPrice = hasPrice
    ? `${formatBillingAmount(billingData.amount, billingData.currency)}${billingData.cycle ? `/${billingData.cycle}` : ""}`
    : ""

  const hasEndDate = Boolean(billingData.endDate)
  let isNeverExpire = false
  let daysLeftObject = {
    days: 0,
    cycleLabel: "",
    remainingPercentage: 0,
  }

  if (hasEndDate) {
    if (billingData.endDate.startsWith("0000-00-00")) {
      isNeverExpire = true
    } else {
      try {
        daysLeftObject = getDaysBetweenDatesWithAutoRenewal(billingData)
      } catch (error) {
        console.error(error)
        return (
          <div className="text-[10px] text-muted-foreground text-red-600">
            {t("billingInfo.remaining")}: {t("billingInfo.error")}
          </div>
        )
      }
    }
  }

  const priceElement = hasPrice ? (
    <p className="text-[10px] text-muted-foreground">
      {t("billingInfo.price")}: {billingPrice}
    </p>
  ) : isFree ? (
    <p className="text-[10px] text-green-600">{t("billingInfo.free")}</p>
  ) : null

  if (!hasEndDate) {
    return priceElement
  }

  return daysLeftObject.days >= 0 ? (
    <>
      {priceElement}
      <div className="text-[10px] text-muted-foreground">
        {t("billingInfo.remaining")}:{" "}
        {isNeverExpire ? t("billingInfo.indefinite") : `${daysLeftObject.days} ${t("billingInfo.days")}`}
      </div>
      {!isNeverExpire && <RemainPercentBar className="mt-0.5" value={daysLeftObject.remainingPercentage * 100} />}
    </>
  ) : (
    <>
      {priceElement}
      <p className={cn("text-[10px] text-muted-foreground text-red-600")}>
        {t("billingInfo.expired")}: {daysLeftObject.days * -1} {t("billingInfo.days")}
      </p>
    </>
  )
}
