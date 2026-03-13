/**
 * Engine barrel exports for the Spokbee parametric pipeline.
 */

// Shared expression evaluator (supports arithmetic AND comparisons)
export { evaluateExpression, evaluateComparison } from "./expression";

// QA Auditor -- validation engine
export { validateConstraints, countNodes, estimateBoundingBox } from "./validator";

// Geometry engine (Three.js scene graph builder)
export { buildAssembly } from "./geometry-engine";
