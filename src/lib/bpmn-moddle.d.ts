declare module "bpmn-moddle" {
  export class BpmnModdle {
    constructor(packages?: Record<string, unknown>);
    fromXML(xml: string): Promise<any>;
    toXML(element: any, options?: { format?: boolean }): Promise<{ xml: string }>;
  }
}
