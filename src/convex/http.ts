/** GuardAsli — نقطه ورود HTTP برای Convex. */
import { httpRouter } from "convex/server";
import { http } from "./httpApi";

const router = httpRouter();

router.route({ pathPrefix: "/", method: "GET", handler: http });
router.route({ pathPrefix: "/", method: "POST", handler: http });
router.route({ pathPrefix: "/", method: "OPTIONS", handler: http });
router.route({ pathPrefix: "/", method: "PUT", handler: http });
router.route({ pathPrefix: "/", method: "DELETE", handler: http });

export default router;
