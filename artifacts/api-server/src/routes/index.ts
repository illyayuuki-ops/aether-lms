import { Router, type IRouter } from "express";
import healthRouter from "./health";
import sessionsRouter from "./sessions";
import adminRouter from "./admin";
import kioskRouter from "./kiosk";

const router: IRouter = Router();

router.use(healthRouter);
router.use("/sessions", sessionsRouter);
router.use("/admin", adminRouter);
router.use("/kiosk", kioskRouter);

export default router;
