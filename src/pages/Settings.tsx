import { useState, useEffect } from "react";
import { useNavigate } from "react-router-dom";
import { Button } from "@/components/ui/button";
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from "@/components/ui/card";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Progress } from "@/components/ui/progress";
import { SidebarTrigger } from "@/components/ui/sidebar";
import { Tabs, TabsContent, TabsList, TabsTrigger } from "@/components/ui/tabs";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select";
import { Switch } from "@/components/ui/switch";
import { Textarea } from "@/components/ui/textarea";
import { AlertDialog, AlertDialogAction, AlertDialogCancel, AlertDialogContent, AlertDialogDescription, AlertDialogTitle, AlertDialogTrigger } from "@/components/ui/alert-dialog";
import { Loader2, Upload, X } from "lucide-react";
import { readRecord, updateRecord, listRecords, uploadFile } from "@/lib/api";
import { toast } from "sonner";

interface CompanyInfo {
  id: number;
  name: string;
  address_line1: string;
  address_line2: string;
  address_line3: string;
  phone1: string;
  phone2: string;
  email: string;
  website: string;
  logo_image_id: number | null;
  contacts_image_id: number | null;
  stamp_image_id: number | null;
  created_at: string;
  updated_at: string;
}

interface AdminImage {
  id: number;
  file_path: string;
  file_name: string;
  image_type: string;
  uploaded_by: number;
  created_at: string;
}

type ImageType = "logo" | "contacts" | "stamp";

// Generic record shape for settings tables
interface SettingsRecord {
  id: number;
  company_id?: number;
  [key: string]: unknown;
}

const Settings = () => {
  const navigate = useNavigate();
  const [activeTab, setActiveTab] = useState("company");
  const [company, setCompany] = useState<CompanyInfo | null>(null);
  const [formData, setFormData] = useState<Partial<CompanyInfo>>({});
  const [isLoading, setIsLoading] = useState(true);
  const [isSaving, setIsSaving] = useState(false);
  const [images, setImages] = useState<Record<ImageType, AdminImage | null>>({
    logo: null,
    contacts: null,
    stamp: null,
  });
  const [uploadProgress, setUploadProgress] = useState<Record<ImageType, number>>({
    logo: 0,
    contacts: 0,
    stamp: 0,
  });
  const [isUploading, setIsUploading] = useState<Record<ImageType, boolean>>({
    logo: false,
    contacts: false,
    stamp: false,
  });

  // Generic settings state for each section
  const [orgDetails, setOrgDetails] = useState<SettingsRecord | null>(null);
  const [orgFormData, setOrgFormData] = useState<Partial<SettingsRecord>>({});
  const [billing, setBilling] = useState<SettingsRecord | null>(null);
  const [billingFormData, setBillingFormData] = useState<Partial<SettingsRecord>>({});
  const [automation, setAutomation] = useState<SettingsRecord | null>(null);
  const [automationFormData, setAutomationFormData] = useState<Partial<SettingsRecord>>({});
  const [policy, setPolicy] = useState<SettingsRecord | null>(null);
  const [policyFormData, setPolicyFormData] = useState<Partial<SettingsRecord>>({});
  const [workflow, setWorkflow] = useState<SettingsRecord | null>(null);
  const [workflowFormData, setWorkflowFormData] = useState<Partial<SettingsRecord>>({});
  const [compliance, setCompliance] = useState<SettingsRecord | null>(null);
  const [complianceFormData, setComplianceFormData] = useState<Partial<SettingsRecord>>({});
  const [connectivity, setConnectivity] = useState<SettingsRecord | null>(null);
  const [connectivityFormData, setConnectivityFormData] = useState<Partial<SettingsRecord>>({});
  const [integrations, setIntegrations] = useState<SettingsRecord | null>(null);
  const [integrationsFormData, setIntegrationsFormData] = useState<Partial<SettingsRecord>>({});

  // Load all settings on mount
  useEffect(() => {
    const loadData = async () => {
      try {
        setIsLoading(true);

        // Company info
        const companyResponse = await readRecord<CompanyInfo>("company_info", "1");
        const companyData = companyResponse.data;
        setCompany(companyData);
        setFormData(companyData);

        // Load all images
        const imagesData = await listRecords<AdminImage>("admin_images");
        const imageMap: Record<ImageType, AdminImage | null> = { logo: null, contacts: null, stamp: null };
        imagesData.data?.forEach((img) => {
          if (img.image_type === "logo" && !imageMap.logo) imageMap.logo = img;
          else if (img.image_type === "contacts" && !imageMap.contacts) imageMap.contacts = img;
          else if (img.image_type === "stamp" && !imageMap.stamp) imageMap.stamp = img;
        });
        setImages(imageMap);

        // Load each settings table (record id = 1)
        const loadSetting = async (table: string) => {
          try {
            const res = await readRecord<SettingsRecord>(table, "1");
            return res.data;
          } catch {
            return null;
          }
        };

        const [org, bill, auto, pol, wf, comp, conn, integ] = await Promise.all([
          loadSetting("organisation_details"),
          loadSetting("billing_settings"),
          loadSetting("automation_settings"),
          loadSetting("policy_settings"),
          loadSetting("workflow_settings"),
          loadSetting("compliance_settings"),
          loadSetting("connectivity_settings"),
          loadSetting("integrations"),
        ]);

        setOrgDetails(org); setOrgFormData(org || {});
        setBilling(bill); setBillingFormData(bill || {});
        setAutomation(auto); setAutomationFormData(auto || {});
        setPolicy(pol); setPolicyFormData(pol || {});
        setWorkflow(wf); setWorkflowFormData(wf || {});
        setCompliance(comp); setComplianceFormData(comp || {});
        setConnectivity(conn); setConnectivityFormData(conn || {});
        setIntegrations(integ); setIntegrationsFormData(integ || {});
      } catch (error) {
        console.error("Failed to load settings:", error);
        toast.error("Failed to load settings");
      } finally {
        setIsLoading(false);
      }
    };

    loadData();
  }, []);

  const handleInputChange = (e: React.ChangeEvent<HTMLInputElement | HTMLTextAreaElement | HTMLSelectElement>) => {
    const { name, value } = e.target;
    setFormData((prev) => ({ ...prev, [name]: value }));
  };

  const handleNestedChange = (setter: React.Dispatch<React.SetStateAction<Partial<SettingsRecord>>>) => (e: React.ChangeEvent<HTMLInputElement | HTMLTextAreaElement | HTMLSelectElement>) => {
    const { name, value } = e.target;
    setter((prev) => ({ ...prev, [name]: value }));
  };

  const handleSwitchChange = (setter: React.Dispatch<React.SetStateAction<Partial<SettingsRecord>>>, name: string) => (checked: boolean) => {
    setter((prev) => ({ ...prev, [name]: checked ? 1 : 0 }));
  };

  const handleSaveCompany = async () => {
    if (!company) return;
    try {
      setIsSaving(true);
      if (!formData.name || !formData.email) {
        toast.error("Company name and email are required");
        return;
      }
      await updateRecord("company_info", company.id.toString(), formData);
      setCompany({ ...company, ...formData } as CompanyInfo);
      toast.success("Company settings saved");
    } catch (error) {
      console.error("Failed to save company settings:", error);
      toast.error("Save failed");
    } finally {
      setIsSaving(false);
    }
  };

  const handleSaveSetting = async (table: string, id: number | undefined, data: Partial<SettingsRecord>, setter: React.Dispatch<React.SetStateAction<SettingsRecord | null>>) => {
    try {
      setIsSaving(true);
      if (id) {
        await updateRecord(table, id.toString(), data);
      } else {
        // create new record
        await updateRecord(table, "1", data);
      }
      const res = await readRecord<SettingsRecord>(table, "1");
      setter(res.data);
      toast.success("Settings saved");
    } catch (error) {
      console.error(`Failed to save ${table}:`, error);
      toast.error("Save failed");
    } finally {
      setIsSaving(false);
    }
  };

  const handleImageUpload = async (e: React.ChangeEvent<HTMLInputElement>, imageType: ImageType) => {
    const file = e.target.files?.[0];
    if (!file) return;
    if (!file.type.startsWith("image/")) {
      toast.error("Please select an image file");
      return;
    }
    try {
      setIsUploading((prev) => ({ ...prev, [imageType]: true }));
      setUploadProgress((prev) => ({ ...prev, [imageType]: 0 }));
      const progressInterval = setInterval(() => {
        setUploadProgress((prev) => {
          const newProgress = Math.min((prev[imageType] || 0) + Math.random() * 30, 90);
          return { ...prev, [imageType]: newProgress };
        });
      }, 200);
      const uploadedImage = await uploadFile(file, { image_type: imageType });
      clearInterval(progressInterval);
      setUploadProgress((prev) => ({ ...prev, [imageType]: 100 }));
      setImages((prev) => ({ ...prev, [imageType]: uploadedImage }));
      const fieldName = `${imageType}_image_id`;
      setFormData((prev) => ({ ...prev, [fieldName]: uploadedImage.id }));
      toast.success(`${imageType} image uploaded successfully`);
    } catch (error) {
      console.error(`Failed to upload ${imageType}:`, error);
      toast.error(`Failed to upload ${imageType}`);
    } finally {
      setIsUploading((prev) => ({ ...prev, [imageType]: false }));
      setUploadProgress((prev) => ({ ...prev, [imageType]: 0 }));
    }
  };

  const handleRemoveImage = (imageType: ImageType) => {
    setImages((prev) => ({ ...prev, [imageType]: null }));
    const fieldName = `${imageType}_image_id`;
    setFormData((prev) => ({ ...prev, [fieldName]: null }));
    toast.success(`${imageType} image removed`);
  };

  if (isLoading) {
    return (
      <div className="flex h-screen items-center justify-center">
        <Loader2 className="h-8 w-8 animate-spin text-primary" />
      </div>
    );
  }

  if (!company) {
    return (
      <div className="flex h-screen items-center justify-center">
        <div className="text-center"><p className="text-muted-foreground">Failed to load settings</p></div>
      </div>
    );
  }

  return (
    <div className="flex flex-col h-screen overflow-y-auto bg-background">
      <div className="border-b bg-card sticky top-0 z-10">
        <div className="flex items-center gap-3 px-6 py-4">
          <SidebarTrigger />
          <div>
            <h1 className="text-2xl font-bold">Settings</h1>
            <p className="text-sm text-muted-foreground">Manage company configuration, policies, workflows, and integrations</p>
          </div>
        </div>
      </div>

      <div className="flex-1 overflow-auto p-6">
        <div className="max-w-5xl mx-auto">
          <Tabs value={activeTab} onValueChange={setActiveTab} className="w-full">
            <TabsList className="grid grid-cols-5 lg:grid-cols-10 mb-6">
              <TabsTrigger value="company">Company</TabsTrigger>
              <TabsTrigger value="organisation">Organisation</TabsTrigger>
              <TabsTrigger value="billing">Billing</TabsTrigger>
              <TabsTrigger value="automation">Automation</TabsTrigger>
              <TabsTrigger value="policies">Policies</TabsTrigger>
              <TabsTrigger value="workflows">Workflows</TabsTrigger>
              <TabsTrigger value="compliance">Compliance</TabsTrigger>
              <TabsTrigger value="audit">Audit Log</TabsTrigger>
              <TabsTrigger value="connectivity">Connectivity</TabsTrigger>
              <TabsTrigger value="integrations">Integrations</TabsTrigger>
            </TabsList>

            {/* Company tab */}
            <TabsContent value="company">
              <Card>
                <CardHeader>
                  <CardTitle>Company Information</CardTitle>
                  <CardDescription>Update your company details and branding</CardDescription>
                </CardHeader>
                <CardContent className="space-y-6">
                  <div className="space-y-2">
                    <Label htmlFor="name">Company Name *</Label>
                    <Input id="name" name="name" value={formData.name || ""} onChange={handleInputChange} placeholder="Company name" />
                  </div>
                  <div className="grid grid-cols-1 gap-4">
                    <div className="space-y-2">
                      <Label htmlFor="address_line1">Address Line 1</Label>
                      <Input id="address_line1" name="address_line1" value={formData.address_line1 || ""} onChange={handleInputChange} />
                    </div>
                    <div className="space-y-2">
                      <Label htmlFor="address_line2">Address Line 2</Label>
                      <Input id="address_line2" name="address_line2" value={formData.address_line2 || ""} onChange={handleInputChange} />
                    </div>
                    <div className="space-y-2">
                      <Label htmlFor="address_line3">Address Line 3</Label>
                      <Input id="address_line3" name="address_line3" value={formData.address_line3 || ""} onChange={handleInputChange} />
                    </div>
                  </div>
                  <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
                    <div className="space-y-2">
                      <Label htmlFor="phone1">Phone 1</Label>
                      <Input id="phone1" name="phone1" type="tel" value={formData.phone1 || ""} onChange={handleInputChange} />
                    </div>
                    <div className="space-y-2">
                      <Label htmlFor="phone2">Phone 2</Label>
                      <Input id="phone2" name="phone2" type="tel" value={formData.phone2 || ""} onChange={handleInputChange} />
                    </div>
                  </div>
                  <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
                    <div className="space-y-2">
                      <Label htmlFor="email">Email *</Label>
                      <Input id="email" name="email" type="email" value={formData.email || ""} onChange={handleInputChange} />
                    </div>
                    <div className="space-y-2">
                      <Label htmlFor="website">Website</Label>
                      <Input id="website" name="website" value={formData.website || ""} onChange={handleInputChange} />
                    </div>
                  </div>
                  <div className="flex justify-end">
                    <Button onClick={handleSaveCompany} disabled={isSaving}>
                      {isSaving && <Loader2 className="h-4 w-4 mr-2 animate-spin" />} Save Company
                    </Button>
                  </div>
                </CardContent>
              </Card>
            </TabsContent>

            {/* Organisation details tab */}
            <TabsContent value="organisation">
              <Card>
                <CardHeader>
                  <CardTitle>Organisation Details</CardTitle>
                  <CardDescription>Legal and registration information</CardDescription>
                </CardHeader>
                <CardContent className="space-y-4">
                  <div className="space-y-2">
                    <Label>Legal Name</Label>
                    <Input name="legal_name" value={String(orgFormData.legal_name || "")} onChange={handleNestedChange(setOrgFormData)} />
                  </div>
                  <div className="space-y-2">
                    <Label>Registration Number</Label>
                    <Input name="registration_number" value={String(orgFormData.registration_number || "")} onChange={handleNestedChange(setOrgFormData)} />
                  </div>
                  <div className="space-y-2">
                    <Label>Tax ID</Label>
                    <Input name="tax_id" value={String(orgFormData.tax_id || "")} onChange={handleNestedChange(setOrgFormData)} />
                  </div>
                  <div className="space-y-2">
                    <Label>Industry</Label>
                    <Input name="industry" value={String(orgFormData.industry || "")} onChange={handleNestedChange(setOrgFormData)} />
                  </div>
                  <div className="space-y-2">
                    <Label>Year Established</Label>
                    <Input name="year_established" type="number" value={String(orgFormData.year_established || "")} onChange={handleNestedChange(setOrgFormData)} />
                  </div>
                  <div className="space-y-2">
                    <Label>Headquarters Country</Label>
                    <Input name="headquarters_country" value={String(orgFormData.headquarters_country || "")} onChange={handleNestedChange(setOrgFormData)} />
                  </div>
                  <div className="space-y-2">
                    <Label>Description</Label>
                    <Textarea name="description" value={String(orgFormData.description || "")} onChange={handleNestedChange(setOrgFormData)} />
                  </div>
                  <div className="flex justify-end">
                    <Button onClick={() => handleSaveSetting("organisation_details", orgDetails?.id, orgFormData, setOrgDetails)} disabled={isSaving}>
                      {isSaving && <Loader2 className="h-4 w-4 mr-2 animate-spin" />} Save Organisation
                    </Button>
                  </div>
                </CardContent>
              </Card>
            </TabsContent>

            {/* Billing tab */}
            <TabsContent value="billing">
              <Card>
                <CardHeader>
                  <CardTitle>Billing Settings</CardTitle>
                  <CardDescription>Payment and invoicing configuration</CardDescription>
                </CardHeader>
                <CardContent className="space-y-4">
                  <div className="space-y-2">
                    <Label>Payment Method</Label>
                    <Select name="payment_method" value={String(billingFormData.payment_method || "bank_transfer")} onValueChange={(v) => setBillingFormData((p) => ({ ...p, payment_method: v }))}>
                      <SelectTrigger><SelectValue /></SelectTrigger>
                      <SelectContent>
                        <SelectItem value="bank_transfer">Bank Transfer</SelectItem>
                        <SelectItem value="card">Card</SelectItem>
                        <SelectItem value="mobile_money">Mobile Money</SelectItem>
                        <SelectItem value="check">Check</SelectItem>
                      </SelectContent>
                    </Select>
                  </div>
                  <div className="space-y-2">
                    <Label>Bank Name</Label>
                    <Input name="bank_name" value={String(billingFormData.bank_name || "")} onChange={handleNestedChange(setBillingFormData)} />
                  </div>
                  <div className="space-y-2">
                    <Label>Account Name</Label>
                    <Input name="account_name" value={String(billingFormData.account_name || "")} onChange={handleNestedChange(setBillingFormData)} />
                  </div>
                  <div className="space-y-2">
                    <Label>Account Number</Label>
                    <Input name="account_number" value={String(billingFormData.account_number || "")} onChange={handleNestedChange(setBillingFormData)} />
                  </div>
                  <div className="space-y-2">
                    <Label>Billing Frequency</Label>
                    <Select name="billing_frequency" value={String(billingFormData.billing_frequency || "monthly")} onValueChange={(v) => setBillingFormData((p) => ({ ...p, billing_frequency: v }))}>
                      <SelectTrigger><SelectValue /></SelectTrigger>
                      <SelectContent>
                        <SelectItem value="monthly">Monthly</SelectItem>
                        <SelectItem value="quarterly">Quarterly</SelectItem>
                        <SelectItem value="annually">Annually</SelectItem>
                      </SelectContent>
                    </Select>
                  </div>
                  <div className="space-y-2">
                    <Label>Tax Rate (%)</Label>
                    <Input name="tax_rate" type="number" step="0.01" value={String(billingFormData.tax_rate || "")} onChange={handleNestedChange(setBillingFormData)} />
                  </div>
                  <div className="space-y-2">
                    <Label>Billing Contact Name</Label>
                    <Input name="billing_contact_name" value={String(billingFormData.billing_contact_name || "")} onChange={handleNestedChange(setBillingFormData)} />
                  </div>
                  <div className="space-y-2">
                    <Label>Billing Contact Email</Label>
                    <Input name="billing_contact_email" type="email" value={String(billingFormData.billing_contact_email || "")} onChange={handleNestedChange(setBillingFormData)} />
                  </div>
                  <div className="flex justify-end">
                    <Button onClick={() => handleSaveSetting("billing_settings", billing?.id, billingFormData, setBilling)} disabled={isSaving}>
                      {isSaving && <Loader2 className="h-4 w-4 mr-2 animate-spin" />} Save Billing
                    </Button>
                  </div>
                </CardContent>
              </Card>
            </TabsContent>

            {/* Automation tab */}
            <TabsContent value="automation">
              <Card>
                <CardHeader>
                  <CardTitle>Automation Settings</CardTitle>
                  <CardDescription>Auto-save, notifications, and data retention</CardDescription>
                </CardHeader>
                <CardContent className="space-y-4">
                  <div className="space-y-2">
                    <Label>Auto-save Interval (minutes)</Label>
                    <Input name="auto_save_minutes" type="number" value={String(automationFormData.auto_save_minutes || "")} onChange={handleNestedChange(setAutomationFormData)} />
                  </div>
                  <div className="flex items-center justify-between">
                    <Label>Auto-export Reports</Label>
                    <Switch checked={Boolean(automationFormData.auto_export_reports)} onCheckedChange={handleSwitchChange(setAutomationFormData, "auto_export_reports")} />
                  </div>
                  <div className="space-y-2">
                    <Label>Scheduled Report Time</Label>
                    <Input name="scheduled_report_time" type="time" value={String(automationFormData.scheduled_report_time || "")} onChange={handleNestedChange(setAutomationFormData)} />
                  </div>
                  <div className="flex items-center justify-between">
                    <Label>Email Notifications</Label>
                    <Switch checked={Boolean(automationFormData.email_notifications)} onCheckedChange={handleSwitchChange(setAutomationFormData, "email_notifications")} />
                  </div>
                  <div className="space-y-2">
                    <Label>Notification Emails (comma-separated)</Label>
                    <Textarea name="notification_emails" value={String(automationFormData.notification_emails || "")} onChange={handleNestedChange(setAutomationFormData)} />
                  </div>
                  <div className="space-y-2">
                    <Label>Data Retention (days)</Label>
                    <Input name="data_retention_days" type="number" value={String(automationFormData.data_retention_days || "")} onChange={handleNestedChange(setAutomationFormData)} />
                  </div>
                  <div className="flex justify-end">
                    <Button onClick={() => handleSaveSetting("automation_settings", automation?.id, automationFormData, setAutomation)} disabled={isSaving}>
                      {isSaving && <Loader2 className="h-4 w-4 mr-2 animate-spin" />} Save Automation
                    </Button>
                  </div>
                </CardContent>
              </Card>
            </TabsContent>

            {/* Policies tab */}
            <TabsContent value="policies">
              <Card>
                <CardHeader>
                  <CardTitle>Policy Settings</CardTitle>
                  <CardDescription>Acceptance margins, standards, and compliance rules</CardDescription>
                </CardHeader>
                <CardContent className="space-y-4">
                  <div className="space-y-2">
                    <Label>Default Acceptance Margin (MPa)</Label>
                    <Input name="default_acceptance_margin_mpa" type="number" step="0.01" value={String(policyFormData.default_acceptance_margin_mpa || "")} onChange={handleNestedChange(setPolicyFormData)} />
                  </div>
                  <div className="flex items-center justify-between">
                    <Label>Require Photo Evidence</Label>
                    <Switch checked={Boolean(policyFormData.require_photo_evidence)} onCheckedChange={handleSwitchChange(setPolicyFormData, "require_photo_evidence")} />
                  </div>
                  <div className="space-y-2">
                    <Label>Default Standard</Label>
                    <Input name="default_standard" value={String(policyFormData.default_standard || "")} onChange={handleNestedChange(setPolicyFormData)} />
                  </div>
                  <div className="space-y-2">
                    <Label>Compliance Mode</Label>
                    <Select name="compliance_mode" value={String(policyFormData.compliance_mode || "full")} onValueChange={(v) => setPolicyFormData((p) => ({ ...p, compliance_mode: v }))}>
                      <SelectTrigger><SelectValue /></SelectTrigger>
                      <SelectContent>
                        <SelectItem value="full">Full</SelectItem>
                        <SelectItem value="summary">Summary</SelectItem>
                        <SelectItem value="minimal">Minimal</SelectItem>
                      </SelectContent>
                    </Select>
                  </div>
                  <div className="flex justify-end">
                    <Button onClick={() => handleSaveSetting("policy_settings", policy?.id, policyFormData, setPolicy)} disabled={isSaving}>
                      {isSaving && <Loader2 className="h-4 w-4 mr-2 animate-spin" />} Save Policies
                    </Button>
                  </div>
                </CardContent>
              </Card>
            </TabsContent>

            {/* Workflows tab */}
            <TabsContent value="workflows">
              <Card>
                <CardHeader>
                  <CardTitle>Workflow Settings</CardTitle>
                  <CardDescription>Test approval chains and save rules</CardDescription>
                </CardHeader>
                <CardContent className="space-y-4">
                  <div className="flex items-center justify-between">
                    <Label>Require Approval Before Save</Label>
                    <Switch checked={Boolean(workflowFormData.require_approval_before_save)} onCheckedChange={handleSwitchChange(setWorkflowFormData, "require_approval_before_save")} />
                  </div>
                  <div className="space-y-2">
                    <Label>Approval Role</Label>
                    <Select name="approval_role" value={String(workflowFormData.approval_role || "senior_technician")} onValueChange={(v) => setWorkflowFormData((p) => ({ ...p, approval_role: v }))}>
                      <SelectTrigger><SelectValue /></SelectTrigger>
                      <SelectContent>
                        <SelectItem value="senior_technician">Senior Technician</SelectItem>
                        <SelectItem value="lab_manager">Lab Manager</SelectItem>
                        <SelectItem value="admin">Admin</SelectItem>
                      </SelectContent>
                    </Select>
                  </div>
                  <div className="flex items-center justify-between">
                    <Label>Auto-advance Test Steps</Label>
                    <Switch checked={Boolean(workflowFormData.auto_advance_test_steps)} onCheckedChange={handleSwitchChange(setWorkflowFormData, "auto_advance_test_steps")} />
                  </div>
                  <div className="flex items-center justify-between">
                    <Label>Save and Next Test</Label>
                    <Switch checked={Boolean(workflowFormData.save_and_next_test)} onCheckedChange={handleSwitchChange(setWorkflowFormData, "save_and_next_test")} />
                  </div>
                  <div className="flex justify-end">
                    <Button onClick={() => handleSaveSetting("workflow_settings", workflow?.id, workflowFormData, setWorkflow)} disabled={isSaving}>
                      {isSaving && <Loader2 className="h-4 w-4 mr-2 animate-spin" />} Save Workflows
                    </Button>
                  </div>
                </CardContent>
              </Card>
            </TabsContent>

            {/* Compliance tab */}
            <TabsContent value="compliance">
              <Card>
                <CardHeader>
                  <CardTitle>Compliance Settings</CardTitle>
                  <CardDescription>Standards, required fields, and audit requirements</CardDescription>
                </CardHeader>
                <CardContent className="space-y-4">
                  <div className="space-y-2">
                    <Label>Active Standards (JSON array)</Label>
                    <Textarea name="active_standards" value={String(complianceFormData.active_standards || "")} onChange={handleNestedChange(setComplianceFormData)} placeholder='["BS EN 12390-3", "BS 1377-2", "ASTM D698"]' />
                  </div>
                  <div className="space-y-2">
                    <Label>Required Fields (JSON)</Label>
                    <Textarea name="required_fields" value={String(complianceFormData.required_fields || "")} onChange={handleNestedChange(setComplianceFormData)} />
                  </div>
                  <div className="flex items-center justify-between">
                    <Label>Audit Required</Label>
                    <Switch checked={Boolean(complianceFormData.audit_required)} onCheckedChange={handleSwitchChange(setComplianceFormData, "audit_required")} />
                  </div>
                  <div className="space-y-2">
                    <Label>Certificate Issuer</Label>
                    <Input name="certificate_issuer" value={String(complianceFormData.certificate_issuer || "")} onChange={handleNestedChange(setComplianceFormData)} />
                  </div>
                  <div className="flex justify-end">
                    <Button onClick={() => handleSaveSetting("compliance_settings", compliance?.id, complianceFormData, setCompliance)} disabled={isSaving}>
                      {isSaving && <Loader2 className="h-4 w-4 mr-2 animate-spin" />} Save Compliance
                    </Button>
                  </div>
                </CardContent>
              </Card>
            </TabsContent>

            {/* Audit log tab */}
            <TabsContent value="audit">
              <Card>
                <CardHeader>
                  <CardTitle>Audit Log</CardTitle>
                  <CardDescription>Recent system activity (read-only)</CardDescription>
                </CardHeader>
                <CardContent>
                  <p className="text-sm text-muted-foreground">Audit log entries will be displayed here once the backend endpoint is connected.</p>
                </CardContent>
              </Card>
            </TabsContent>

            {/* Connectivity tab */}
            <TabsContent value="connectivity">
              <Card>
                <CardHeader>
                  <CardTitle>Connectivity Settings</CardTitle>
                  <CardDescription>Network and API configuration</CardDescription>
                </CardHeader>
                <CardContent className="space-y-4">
                  <div className="space-y-2">
                    <Label>API Endpoint</Label>
                    <Input name="api_endpoint" value={String(connectivityFormData.api_endpoint || "")} onChange={handleNestedChange(setConnectivityFormData)} />
                  </div>
                  <div className="space-y-2">
                    <Label>Network Timeout (seconds)</Label>
                    <Input name="network_timeout_seconds" type="number" value={String(connectivityFormData.network_timeout_seconds || "")} onChange={handleNestedChange(setConnectivityFormData)} />
                  </div>
                  <div className="flex items-center justify-between">
                    <Label>Enable SSL</Label>
                    <Switch checked={Boolean(connectivityFormData.enable_ssl)} onCheckedChange={handleSwitchChange(setConnectivityFormData, "enable_ssl")} />
                  </div>
                  <div className="space-y-2">
                    <Label>Proxy URL</Label>
                    <Input name="proxy_url" value={String(connectivityFormData.proxy_url || "")} onChange={handleNestedChange(setConnectivityFormData)} />
                  </div>
                  <div className="flex justify-end">
                    <Button onClick={() => handleSaveSetting("connectivity_settings", connectivity?.id, connectivityFormData, setConnectivity)} disabled={isSaving}>
                      {isSaving && <Loader2 className="h-4 w-4 mr-2 animate-spin" />} Save Connectivity
                    </Button>
                  </div>
                </CardContent>
              </Card>
            </TabsContent>

            {/* Integrations tab */}
            <TabsContent value="integrations">
              <Card>
                <CardHeader>
                  <CardTitle>Integrations</CardTitle>
                  <CardDescription>Third-party service connections</CardDescription>
                </CardHeader>
                <CardContent className="space-y-4">
                  <div className="space-y-2">
                    <Label>Integration Type</Label>
                    <Input name="integration_type" value={String(integrationsFormData.integration_type || "")} onChange={handleNestedChange(setIntegrationsFormData)} placeholder="e.g. LIMS, ERP, PAYMENT" />
                  </div>
                  <div className="space-y-2">
                    <Label>Provider</Label>
                    <Input name="provider" value={String(integrationsFormData.provider || "")} onChange={handleNestedChange(setIntegrationsFormData)} placeholder="e.g. QuickBooks, Salesforce" />
                  </div>
                  <div className="space-y-2">
                    <Label>Configuration (JSON)</Label>
                    <Textarea name="config" value={String(integrationsFormData.config || "")} onChange={handleNestedChange(setIntegrationsFormData)} />
                  </div>
                  <div className="flex items-center justify-between">
                    <Label>Active</Label>
                    <Switch checked={Boolean(integrationsFormData.is_active)} onCheckedChange={handleSwitchChange(setIntegrationsFormData, "is_active")} />
                  </div>
                  <div className="flex justify-end">
                    <Button onClick={() => handleSaveSetting("integrations", integrations?.id, integrationsFormData, setIntegrations)} disabled={isSaving}>
                      {isSaving && <Loader2 className="h-4 w-4 mr-2 animate-spin" />} Save Integrations
                    </Button>
                  </div>
                </CardContent>
              </Card>
            </TabsContent>
          </Tabs>
        </div>
      </div>
    </div>
  );
};

export default Settings;