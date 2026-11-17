import { Button } from "@/components/ui/button"
import {
  Dialog,
  DialogContent,
  DialogDescription,
  DialogFooter,
  DialogHeader,
  DialogTitle,
} from "@/components/ui/dialog"
import { useTranslation } from "react-i18next"

interface LiveTimeoutModalProps {
  open: boolean
  timeoutMinutes: number
  onContinue: () => void
  onClose: () => void
}

export default function LiveTimeoutModal({ open, timeoutMinutes, onContinue, onClose }: LiveTimeoutModalProps) {
  const { t } = useTranslation()

  return (
    <Dialog open={open} onOpenChange={(isOpen) => !isOpen && onClose()}>
      <DialogContent className="sm:max-w-[400px] rounded-2xl">
        <DialogHeader>
          <DialogTitle>{t("wsTimeout.title", "实时推送已暂停")}</DialogTitle>
          <DialogDescription>
            {t("wsTimeout.desc", {
              defaultValue: `实时监控连接已持续运行 ${timeoutMinutes} 分钟并按站点策略自动断开，以节省服务器额度。是否继续保持实时推送？`,
              minutes: timeoutMinutes,
            })}
          </DialogDescription>
        </DialogHeader>
        <DialogFooter className="gap-2 sm:gap-0">
          <Button variant="outline" onClick={onClose}>
            {t("wsTimeout.keepStatic", "保持静态展示")}
          </Button>
          <Button onClick={onContinue}>{t("wsTimeout.continue", "继续实时连接")}</Button>
        </DialogFooter>
      </DialogContent>
    </Dialog>
  )
}
