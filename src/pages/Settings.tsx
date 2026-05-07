import { useState, useEffect } from "react";
import { useNavigate } from "react-router-dom";
import { Button } from "@/components/ui/button";
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from "@/components/ui/card";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Progress } from "@/components/ui/progress";
import { SidebarProvider, SidebarInset, SidebarTrigger } from "@/components/ui/sidebar";
import { AlertDialog, AlertDialogAction, AlertDialogCancel, AlertDialogContent, AlertDialogDescription, AlertDialogTitle, AlertDialogTrigger } from "@/components/ui/alert-dialog";
import { Loader2, Upload, X } from "lucide-react";
import Navigation from "@/components/Navigation";
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

const Settings = () => {
  const navigate = useNavigate();
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

  // Load company data
  useEffect(() => {
    const loadData = async () => {
      try {
        setIsLoading(true);
        const companyResponse = await readRecord<CompanyInfo>("company_info", "1");
        const companyData = companyResponse.data;
        setCompany(companyData);
        setFormData(companyData);

        // Load all images
        const imagesData = await listRecords<AdminImage>("admin_images");
        const imageMap: Record<ImageType, AdminImage | null> = {
          logo: null,
          contacts: null,
          stamp: null,
        };

        imagesData.data?.forEach((img) => {
          if (img.image_type === "logo" && !imageMap.logo) {
            imageMap.logo = img;
          } else if (img.image_type === "contacts" && !imageMap.contacts) {
            imageMap.contacts = img;
          } else if (img.image_type === "stamp" && !imageMap.stamp) {
            imageMap.stamp = img;
          }
        });

        setImages(imageMap);
      } catch (error) {
        console.error("Failed to load company settings:", error);
        toast.error("Failed to load company settings");
      } finally {
        setIsLoading(false);
      }
    };

    loadData();
  }, []);

  const handleInputChange = (e: React.ChangeEvent<HTMLInputElement | HTMLTextAreaElement>) => {
    const { name, value } = e.target;
    setFormData((prev) => ({ ...prev, [name]: value }));
  };

  const handleImageUpload = async (e: React.ChangeEvent<HTMLInputElement>, imageType: ImageType) => {
    const file = e.target.files?.[0];
    if (!file) return;

    // Validate file type
    if (!file.type.startsWith("image/")) {
      toast.error("Please select an image file");
      return;
    }

    try {
      setIsUploading((prev) => ({ ...prev, [imageType]: true }));
      setUploadProgress((prev) => ({ ...prev, [imageType]: 0 }));

      // Simulate upload progress
      const progressInterval = setInterval(() => {
        setUploadProgress((prev) => {
          const newProgress = Math.min((prev[imageType] || 0) + Math.random() * 30, 90);
          return { ...prev, [imageType]: newProgress };
        });
      }, 200);

      const uploadedImage = await uploadFile(file, { image_type: imageType });

      clearInterval(progressInterval);
      setUploadProgress((prev) => ({ ...prev, [imageType]: 100 }));

      // Update local images state
      setImages((prev) => ({
        ...prev,
        [imageType]: uploadedImage,
      }));

      // Update form data with new image ID
      const fieldName = `${imageType}_image_id`;
      setFormData((prev) => ({
        ...prev,
        [fieldName]: uploadedImage.id,
      }));

      toast.success(`${imageType} image uploaded successfully`);
    } catch (error) {
      console.error(`Failed to upload ${imageType} image:`, error);
      toast.error(`Failed to upload ${imageType} image`);
    } finally {
      setIsUploading((prev) => ({ ...prev, [imageType]: false }));
      setUploadProgress((prev) => ({ ...prev, [imageType]: 0 }));
    }
  };

  const handleRemoveImage = (imageType: ImageType) => {
    setImages((prev) => ({
      ...prev,
      [imageType]: null,
    }));

    const fieldName = `${imageType}_image_id`;
    setFormData((prev) => ({
      ...prev,
      [fieldName]: null,
    }));

    toast.success(`${imageType} image removed`);
  };

  const handleSave = async () => {
    if (!company) return;

    try {
      setIsSaving(true);

      // Validate required fields
      if (!formData.name || !formData.email) {
        toast.error("Company name and email are required");
        return;
      }

      await updateRecord("company_info", company.id.toString(), formData);
      setCompany({ ...company, ...formData } as CompanyInfo);
      toast.success("Company settings saved successfully");
    } catch (error) {
      console.error("Failed to save company settings:", error);
      toast.error("Failed to save company settings");
    } finally {
      setIsSaving(false);
    }
  };

  const handleLogout = () => {
    toast.success("Logged out");
    navigate("/login", { replace: true });
  };

  if (isLoading) {
    return (
      <SidebarProvider>
        <Navigation currentView="settings" onViewChange={() => {}} onLogout={handleLogout} />
        <SidebarInset>
          <div className="flex h-screen items-center justify-center">
            <Loader2 className="h-8 w-8 animate-spin text-primary" />
          </div>
        </SidebarInset>
      </SidebarProvider>
    );
  }

  if (!company) {
    return (
      <SidebarProvider>
        <Navigation currentView="settings" onViewChange={() => {}} onLogout={handleLogout} />
        <SidebarInset>
          <div className="flex h-screen items-center justify-center">
            <div className="text-center">
              <p className="text-muted-foreground">Failed to load company settings</p>
            </div>
          </div>
        </SidebarInset>
      </SidebarProvider>
    );
  }

  return (
    <SidebarProvider>
      <Navigation currentView="settings" onViewChange={() => {}} onLogout={handleLogout} />
      <SidebarInset>
        <div className="flex flex-col h-screen overflow-y-auto bg-background">
          {/* Header */}
          <div className="border-b bg-card sticky top-0 z-10">
            <div className="flex items-center gap-3 px-6 py-4">
              <SidebarTrigger />
              <div>
                <h1 className="text-2xl font-bold">Company Settings</h1>
                <p className="text-sm text-muted-foreground">Manage company information and branding</p>
              </div>
            </div>
          </div>

          {/* Content */}
          <div className="flex-1 overflow-auto p-6">
            <div className="max-w-4xl mx-auto space-y-6">
              {/* Company Information Section */}
              <Card>
                <CardHeader>
                  <CardTitle>Company Information</CardTitle>
                  <CardDescription>Update your company details</CardDescription>
                </CardHeader>
                <CardContent className="space-y-6">
                  {/* Name */}
                  <div className="space-y-2">
                    <Label htmlFor="name">Company Name *</Label>
                    <Input
                      id="name"
                      name="name"
                      value={formData.name || ""}
                      onChange={handleInputChange}
                      placeholder="Cransfield Materials Testing Center"
                    />
                  </div>

                  {/* Address */}
                  <div className="grid grid-cols-1 gap-4">
                    <div className="space-y-2">
                      <Label htmlFor="address_line1">Address Line 1</Label>
                      <Input
                        id="address_line1"
                        name="address_line1"
                        value={formData.address_line1 || ""}
                        onChange={handleInputChange}
                        placeholder="P.O. Box 59401 - 00200"
                      />
                    </div>
                    <div className="space-y-2">
                      <Label htmlFor="address_line2">Address Line 2</Label>
                      <Input
                        id="address_line2"
                        name="address_line2"
                        value={formData.address_line2 || ""}
                        onChange={handleInputChange}
                        placeholder="Nairobi, Kenya"
                      />
                    </div>
                    <div className="space-y-2">
                      <Label htmlFor="address_line3">Address Line 3</Label>
                      <Input
                        id="address_line3"
                        name="address_line3"
                        value={formData.address_line3 || ""}
                        onChange={handleInputChange}
                        placeholder="Runda Grove House No. 278"
                      />
                    </div>
                  </div>

                  {/* Contact Information */}
                  <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
                    <div className="space-y-2">
                      <Label htmlFor="phone1">Phone 1</Label>
                      <Input
                        id="phone1"
                        name="phone1"
                        type="tel"
                        value={formData.phone1 || ""}
                        onChange={handleInputChange}
                        placeholder="+254 703410973"
                      />
                    </div>
                    <div className="space-y-2">
                      <Label htmlFor="phone2">Phone 2</Label>
                      <Input
                        id="phone2"
                        name="phone2"
                        type="tel"
                        value={formData.phone2 || ""}
                        onChange={handleInputChange}
                        placeholder="+254 721740587"
                      />
                    </div>
                  </div>

                  {/* Email and Website */}
                  <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
                    <div className="space-y-2">
                      <Label htmlFor="email">Email *</Label>
                      <Input
                        id="email"
                        name="email"
                        type="email"
                        value={formData.email || ""}
                        onChange={handleInputChange}
                        placeholder="info@cmtc.co.ke"
                      />
                    </div>
                    <div className="space-y-2">
                      <Label htmlFor="website">Website</Label>
                      <Input
                        id="website"
                        name="website"
                        value={formData.website || ""}
                        onChange={handleInputChange}
                        placeholder="www.cmtc.co.ke"
                      />
                    </div>
                  </div>
                </CardContent>
              </Card>

              {/* Image Management Section */}
              <Card>
                <CardHeader>
                  <CardTitle>Company Images</CardTitle>
                  <CardDescription>Upload and manage your company branding images</CardDescription>
                </CardHeader>
                <CardContent>
                  <div className="grid grid-cols-1 md:grid-cols-3 gap-6">
                    {/* Logo Image Card */}
                    <ImageCard
                      type="logo"
                      title="Logo"
                      image={images.logo}
                      isUploading={isUploading.logo}
                      uploadProgress={uploadProgress.logo}
                      onUpload={(e) => handleImageUpload(e, "logo")}
                      onRemove={() => handleRemoveImage("logo")}
                    />

                    {/* Contacts Image Card */}
                    <ImageCard
                      type="contacts"
                      title="Contacts"
                      image={images.contacts}
                      isUploading={isUploading.contacts}
                      uploadProgress={uploadProgress.contacts}
                      onUpload={(e) => handleImageUpload(e, "contacts")}
                      onRemove={() => handleRemoveImage("contacts")}
                    />

                    {/* Stamp Image Card */}
                    <ImageCard
                      type="stamp"
                      title="Stamp"
                      image={images.stamp}
                      isUploading={isUploading.stamp}
                      uploadProgress={uploadProgress.stamp}
                      onUpload={(e) => handleImageUpload(e, "stamp")}
                      onRemove={() => handleRemoveImage("stamp")}
                    />
                  </div>
                </CardContent>
              </Card>

              {/* Save Button */}
              <div className="flex justify-end gap-3">
                <Button variant="outline" onClick={() => navigate(-1)}>
                  Cancel
                </Button>
                <Button onClick={handleSave} disabled={isSaving}>
                  {isSaving && <Loader2 className="h-4 w-4 mr-2 animate-spin" />}
                  Save Changes
                </Button>
              </div>
            </div>
          </div>
        </div>
      </SidebarInset>
    </SidebarProvider>
  );
};

interface ImageCardProps {
  type: ImageType;
  title: string;
  image: AdminImage | null;
  isUploading: boolean;
  uploadProgress: number;
  onUpload: (e: React.ChangeEvent<HTMLInputElement>) => void;
  onRemove: () => void;
}

function ImageCard({ type, title, image, isUploading, uploadProgress, onUpload, onRemove }: ImageCardProps) {
  const baseUrl = "https://lab.wayrus.co.ke";

  return (
    <div className="border rounded-lg p-4 bg-card hover:bg-accent/50 transition-colors">
      <h3 className="font-semibold mb-3">{title}</h3>

      {/* Image Preview */}
      <div className="mb-4 bg-muted rounded-lg h-40 flex items-center justify-center overflow-hidden relative">
        {image ? (
          <img
            src={`${baseUrl}/${image.file_path}`}
            alt={title}
            className="h-full w-full object-contain"
          />
        ) : (
          <div className="text-center text-muted-foreground text-sm">
            <Upload className="h-8 w-8 mx-auto mb-2 opacity-50" />
            <p>No image</p>
          </div>
        )}

        {isUploading && (
          <div className="absolute inset-0 bg-black/50 flex items-center justify-center">
            <Loader2 className="h-6 w-6 animate-spin text-white" />
          </div>
        )}
      </div>

      {/* Upload Progress */}
      {isUploading && uploadProgress > 0 && (
        <div className="mb-4">
          <Progress value={uploadProgress} className="h-2" />
          <p className="text-xs text-muted-foreground mt-1">{Math.round(uploadProgress)}%</p>
        </div>
      )}

      {/* Upload Input */}
      <input
        type="file"
        accept="image/*"
        onChange={onUpload}
        disabled={isUploading}
        className="hidden"
        id={`upload-${type}`}
      />

      {/* Action Buttons */}
      <div className="flex gap-2">
        <Button
          variant="outline"
          size="sm"
          className="flex-1"
          onClick={() => document.getElementById(`upload-${type}`)?.click()}
          disabled={isUploading}
        >
          <Upload className="h-4 w-4 mr-1" />
          Upload
        </Button>

        {image && (
          <AlertDialog>
            <AlertDialogTrigger asChild>
              <Button variant="outline" size="sm" disabled={isUploading}>
                <X className="h-4 w-4" />
              </Button>
            </AlertDialogTrigger>
            <AlertDialogContent>
              <AlertDialogTitle>Remove Image</AlertDialogTitle>
              <AlertDialogDescription>
                Are you sure you want to remove the {title.toLowerCase()} image? This action cannot be undone.
              </AlertDialogDescription>
              <div className="flex gap-3 justify-end">
                <AlertDialogCancel>Cancel</AlertDialogCancel>
                <AlertDialogAction onClick={onRemove} className="bg-destructive text-destructive-foreground hover:bg-destructive/90">
                  Remove
                </AlertDialogAction>
              </div>
            </AlertDialogContent>
          </AlertDialog>
        )}
      </div>
    </div>
  );
}

export default Settings;
