import { useEffect, useRef, useState } from "react"
import { Link, useNavigate, useParams } from "react-router"
import { ChevronLeft, Crop, MapPin, Sparkles, UploadCloud, X } from "lucide-react"

import { Button } from "@/components/ui/button"
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from "@/components/ui/card"
import { Input } from "@/components/ui/input"
import { Textarea } from "@/components/ui/textarea"
import { processRpcRequest } from "@/api/helpers"
import { useSetListingWeeklySlots } from "@/hooks/useHours"
import { useCreateListing, useGetListing, useUpdateListing } from "@/hooks/useListings"
import { useUser } from "@/store/user_state"
import type { Listing as ApiListing } from "@/types/custom/api.types"

type CitySuggestion = {
  id: string
  name: string
}

type AddressSuggestion = CitySuggestion

type UploadedImage = {
  file?: File
  persistedUrl?: string
  previewUrl: string
  isObjectUrl: boolean
}

type GoogleAutocompleteResponse = {
  suggestions?: Array<{
    placePrediction?: {
      placeId?: string
      text?: {
        text?: string
      }
    }
  }>
}

type GoogleGeocodeResponse = {
  results?: Array<{
    geometry?: {
      location?: {
        lat?: number
        lng?: number
      }
    }
  }>
}

type GoogleTimeZoneResponse = {
  status?: string
  timeZoneId?: string
}

type CropDragMode = "move" | "n" | "s" | "e" | "w" | "ne" | "nw" | "se" | "sw"

const GOOGLE_MAPS_API_KEY = import.meta.env.VITE_PUBLIC_GOOGLE_MAPS_API_KEY as string | undefined
const WEEK_DAYS = ["Sun", "Mon", "Tue", "Wed", "Thu", "Fri", "Sat"] as const
const HOURS = Array.from({ length: 24 }, (_, hour) => hour)
const SLOT_COUNT = 7 * 24

type ListingFormState = {
  title: string
  subtitle: string
  category: string
  address: string
  hourlyRate: string
  areaM2: string
  description: string
  equipmentDesc: string
  conveniencesDesc: string
}

const initialFormState: ListingFormState = {
  title: "rehearsal space in london",
  subtitle: "london on",
  category: "REHEARSAL_SPACE",
  address: "",
  hourlyRate: "30",
  areaM2: "25",
  description: "pizdec",
  equipmentDesc: "drum kit, guitar amps, microphones",
  conveniencesDesc: "bathroom, A/C, Wi‑Fi",
}

export default function CreateListingPage() {
  const { id } = useParams()
  const isEditMode = Boolean(id)
  const navigate = useNavigate()
  const user = useUser()
  const createListingMutation = useCreateListing()
  const updateListingMutation = useUpdateListing()
  const setListingWeeklySlotsMutation = useSetListingWeeklySlots()
  const listingQuery = useGetListing(isEditMode ? id : undefined)
  const [form, setForm] = useState<ListingFormState>(initialFormState)
  const [formError, setFormError] = useState<string | null>(null)
  const [isSubmitting, setIsSubmitting] = useState(false)
  const [uploadedImages, setUploadedImages] = useState<UploadedImage[]>([])
  const [addressSuggestions, setAddressSuggestions] = useState<AddressSuggestion[]>([])
  const [isLoadingAddresses, setIsLoadingAddresses] = useState(false)
  const [addressError, setAddressError] = useState<string | null>(null)
  const [isAddressDropdownOpen, setIsAddressDropdownOpen] = useState(false)
  const [weeklySlotPrices, setWeeklySlotPrices] = useState<string[]>(() => Array.from({ length: SLOT_COUNT }, () => initialFormState.hourlyRate))
  const [bulkWeekPrice, setBulkWeekPrice] = useState(initialFormState.hourlyRate)
  const [cropImageIndex, setCropImageIndex] = useState<number | null>(null)
  const [isCropEditMode, setIsCropEditMode] = useState(false)
  const [cropSelection, setCropSelection] = useState<{ x: number; y: number; width: number; height: number } | null>(null)
  const [cropStartPoint, setCropStartPoint] = useState<{ x: number; y: number } | null>(null)
  const [isSelectingCrop, setIsSelectingCrop] = useState(false)
  const [cropDrag, setCropDrag] = useState<{
    mode: CropDragMode
    startX: number
    startY: number
    initial: { x: number; y: number; width: number; height: number }
  } | null>(null)
  const [isApplyingCrop, setIsApplyingCrop] = useState(false)
  const hasLoadedWeeklySlotsRef = useRef(false)
  const cropImageRef = useRef<HTMLImageElement>(null)

  const MIN_CROP_SIZE = 4

  const clamp = (value: number, min: number, max: number) => Math.min(max, Math.max(min, value))

  useEffect(() => {
    if (!user) {
      const redirect = isEditMode && id ? `/host/edit-listing/${id}` : "/host/create-listing"
      navigate(`/login?redirect=${encodeURIComponent(redirect)}`, { replace: true })
    }
  }, [user, navigate, isEditMode, id])

  useEffect(() => {
    return () => {
      uploadedImages.forEach((image) => {
        if (image.isObjectUrl) {
          URL.revokeObjectURL(image.previewUrl)
        }
      })
    }
  }, [uploadedImages])

  useEffect(() => {
    if (!isEditMode || !listingQuery.data) return

    const listing = listingQuery.data as ApiListing

    setForm({
      title: listing.title ?? "",
      subtitle: listing.subtitle ?? "",
      category: listing.category ?? "REHEARSAL_SPACE",
      address: listing.address ?? "",
      hourlyRate: String(listing.price ?? ""),
      areaM2: String(listing.area_m2 ?? ""),
      description: listing.description ?? "",
      equipmentDesc: listing.equipment_desc ?? "",
      conveniencesDesc: listing.conveniences_desc ?? "",
    })

    setUploadedImages(
      (listing.images ?? []).map((url) => ({
        persistedUrl: url,
        previewUrl: url,
        isObjectUrl: false,
      }))
    )
  }, [isEditMode, listingQuery.data])

  useEffect(() => {
    if (!isEditMode || !id || hasLoadedWeeklySlotsRef.current) return

    const loadWeeklySlots = async () => {
      const weekDate = new Date().toISOString().slice(0, 10)
      const rows = (await processRpcRequest("list_listing_week_slots", {
        p_listing_id: id,
        p_week: weekDate,
      })) as Array<{ date?: string; hour?: number; price?: number | null }> | null

      if (!rows || rows.length === 0) {
        hasLoadedWeeklySlotsRef.current = true
        return
      }

      const next = Array.from({ length: SLOT_COUNT }, () => "")

      rows.forEach((row) => {
        const date = typeof row.date === "string" ? row.date : ""
        const hour = typeof row.hour === "number" ? row.hour : -1
        const price = typeof row.price === "number" ? row.price : null

        if (!date || hour < 0 || hour > 23 || price === null) return

        const weekday = new Date(`${date}T00:00:00`).getDay()
        const index = weekday * 24 + hour
        if (index < 0 || index >= SLOT_COUNT) return
        next[index] = String(price)
      })

      setWeeklySlotPrices(next)
      hasLoadedWeeklySlotsRef.current = true
    }

    void loadWeeklySlots()
  }, [isEditMode, id])

  useEffect(() => {
    const trimmedQuery = form.address.trim()

    if (trimmedQuery.length < 3) {
      setAddressSuggestions([])
      setIsLoadingAddresses(false)
      setAddressError(null)
      return
    }

    if (!GOOGLE_MAPS_API_KEY) {
      setAddressSuggestions([])
      setIsLoadingAddresses(false)
      setAddressError("Missing Google Maps API key")
      return
    }

    const controller = new AbortController()
    const timeoutId = setTimeout(async () => {
      setIsLoadingAddresses(true)
      setAddressError(null)

      try {
        const response = await fetch("https://places.googleapis.com/v1/places:autocomplete", {
          method: "POST",
          headers: {
            "Content-Type": "application/json",
            "X-Goog-Api-Key": GOOGLE_MAPS_API_KEY,
            "X-Goog-FieldMask": "suggestions.placePrediction.placeId,suggestions.placePrediction.text.text",
          },
          body: JSON.stringify({
            input: trimmedQuery,
            includedPrimaryTypes: ["street_address", "premise", "subpremise"],
          }),
          signal: controller.signal,
        })

        if (!response.ok) {
          throw new Error(`Google API error: ${response.status}`)
        }

        const data = (await response.json()) as GoogleAutocompleteResponse

        const parsedSuggestions: AddressSuggestion[] = (data.suggestions ?? [])
          .map((item) => item.placePrediction)
          .filter((prediction): prediction is NonNullable<typeof prediction> => Boolean(prediction?.placeId && prediction?.text?.text))
          .map((prediction) => ({
            id: prediction.placeId as string,
            name: prediction.text?.text as string,
          }))

        const uniqueSuggestions = Array.from(
          new Map(parsedSuggestions.map((item) => [item.id, item])).values()
        ).slice(0, 6)

        setAddressSuggestions(uniqueSuggestions)
      } catch (error) {
        if ((error as Error).name !== "AbortError") {
          setAddressSuggestions([])
          setAddressError("Could not load address suggestions")
        }
      } finally {
        if (!controller.signal.aborted) {
          setIsLoadingAddresses(false)
        }
      }
    }, 250)

    return () => {
      clearTimeout(timeoutId)
      controller.abort()
    }
  }, [form.address])

  const handleImageUpload = async (event: React.ChangeEvent<HTMLInputElement>) => {
    const files = Array.from(event.target.files ?? [])

    if (files.length === 0) {
      return
    }

    if (uploadedImages.length + files.length > 5) {
      setFormError("You can upload up to 5 images.")
      event.target.value = ""
      return
    }

    setFormError(null)

    const imageFiles = files.filter((file) => file.type.startsWith("image/"))

    if (imageFiles.length !== files.length) {
      setFormError("Only image files are allowed.")
      event.target.value = ""
      return
    }

    setUploadedImages((prev) => [
      ...prev,
      ...imageFiles.map((file) => ({
        file,
        previewUrl: URL.createObjectURL(file),
        isObjectUrl: true,
      })),
    ])
    event.target.value = ""
  }

  const submit = async () => {
    if (isSubmitting || createListingMutation.isPending || updateListingMutation.isPending || setListingWeeklySlotsMutation.isPending) return

    setFormError(null)

    const hourlyRate = Number(form.hourlyRate)
    const areaM2 = Number(form.areaM2)

    if (!form.title.trim()) return setFormError("Title is required.")
    if (!form.subtitle.trim()) return setFormError("Subtitle is required.")
    if (!form.category.trim()) return setFormError("Category is required.")
    if (!form.address.trim()) return setFormError("Address is required.")
    if (!Number.isFinite(hourlyRate) || hourlyRate <= 0) return setFormError("Hourly rate must be a valid number.")
    if (!Number.isFinite(areaM2) || areaM2 <= 0) return setFormError("Area must be a valid positive number.")
    if (uploadedImages.length === 0) return setFormError("Please upload at least one image.")
    if (!form.description.trim()) return setFormError("Description is required.")
    if (!form.equipmentDesc.trim()) return setFormError("Equipment description is required.")
    if (!form.conveniencesDesc.trim()) return setFormError("Conveniences description is required.")
    if (!GOOGLE_MAPS_API_KEY) return setFormError("Missing Google Maps API key.")

    const weeklySlotsPayload = [] as Array<{ weekday: number; hour: number; price: number }>
    for (let index = 0; index < SLOT_COUNT; index += 1) {
      const raw = weeklySlotPrices[index]?.trim() ?? ""
      if (!raw) continue

      const price = Number(raw)
      if (!Number.isFinite(price) || price <= 0) {
        return setFormError("Weekly hours table has invalid prices. Use positive numbers or leave empty for closed hours.")
      }

      weeklySlotsPayload.push({
        weekday: Math.floor(index / 24),
        hour: index % 24,
        price,
      })
    }

    if (weeklySlotsPayload.length === 0) {
      return setFormError("Please set at least one working hour in the weekly hours table.")
    }

    setIsSubmitting(true)

    let lat: number
    let lng: number
    let timezone: string

    try {
      const geocodeResponse = await fetch(
        `https://maps.googleapis.com/maps/api/geocode/json?address=${encodeURIComponent(form.address.trim())}&key=${GOOGLE_MAPS_API_KEY}`
      )

      if (!geocodeResponse.ok) {
        setFormError("Could not resolve address coordinates. Please try another address.")
        setIsSubmitting(false)
        return
      }

      const geocodeData = (await geocodeResponse.json()) as GoogleGeocodeResponse
      const resolvedLat = geocodeData.results?.[0]?.geometry?.location?.lat
      const resolvedLng = geocodeData.results?.[0]?.geometry?.location?.lng

      if (typeof resolvedLat !== "number" || typeof resolvedLng !== "number") {
        setFormError("Could not resolve address coordinates. Please select an address suggestion.")
        setIsSubmitting(false)
        return
      }

      lat = resolvedLat
      lng = resolvedLng
    } catch {
      setFormError("Could not resolve address coordinates. Please try again.")
      setIsSubmitting(false)
      return
    }

    try {
      const timezoneResponse = await fetch(
        `https://maps.googleapis.com/maps/api/timezone/json?location=${lat},${lng}&timestamp=${Math.floor(Date.now() / 1000)}&key=${GOOGLE_MAPS_API_KEY}`
      )

      if (!timezoneResponse.ok) {
        setFormError("Could not resolve listing timezone. Please try again.")
        setIsSubmitting(false)
        return
      }

      const timezoneData = (await timezoneResponse.json()) as GoogleTimeZoneResponse
      const timeZoneId = typeof timezoneData.timeZoneId === "string" ? timezoneData.timeZoneId : ""

      if (timezoneData.status !== "OK" || !timeZoneId) {
        setFormError("Could not resolve listing timezone. Please select a precise address.")
        setIsSubmitting(false)
        return
      }

      timezone = timeZoneId
    } catch {
      setFormError("Could not resolve listing timezone. Please try again.")
      setIsSubmitting(false)
      return
    }

    const imagesPayload = uploadedImages
      .map((image) => image.persistedUrl ?? image.file)
      .filter((value): value is string | File => Boolean(value))

    if (isEditMode && id) {
      updateListingMutation.mutate(
        {
          p_id: id,
          p_lat: lat,
          p_lng: lng,
          p_address: form.address.trim(),
          p_title: form.title.trim(),
          p_subtitle: form.subtitle.trim(),
          p_category: form.category.trim(),
          p_price: hourlyRate,
          p_images: imagesPayload,
          p_description: form.description.trim(),
          p_equipment_desc: form.equipmentDesc.trim(),
          p_conveniences_desc: form.conveniencesDesc.trim(),
          p_area_m2: areaM2,
          p_timezone: timezone,
        },
        {
          onSuccess: async (data: any) => {
            const listingId = data?.id ?? id
            const slotsSaved = await setListingWeeklySlotsMutation.mutateAsync({
              p_listing_id: listingId,
              p_slots: weeklySlotsPayload,
            })

            if (!slotsSaved) {
              setFormError("Listing was updated, but weekly hours could not be saved.")
              setIsSubmitting(false)
              return
            }

            setIsSubmitting(false)
            navigate(`/listing/${listingId}`)
          },
          onError: (error: any) => {
            setFormError(error?.message || "Failed to update listing.")
            setIsSubmitting(false)
          },
        }
      )
      return
    }

    createListingMutation.mutate(
      {
        p_lat: lat,
        p_lng: lng,
        p_address: form.address.trim(),
        p_title: form.title.trim(),
        p_subtitle: form.subtitle.trim(),
        p_category: form.category.trim(),
        p_price: hourlyRate,
        p_images: imagesPayload,
        p_description: form.description.trim(),
        p_equipment_desc: form.equipmentDesc.trim(),
        p_conveniences_desc: form.conveniencesDesc.trim(),
        p_area_m2: areaM2,
        p_timezone: timezone,
      },
      {
        onSuccess: async (data: any) => {
          const listingId = data?.id as string | undefined
          if (!listingId) {
            setFormError("Listing created but missing listing id for weekly hours save.")
            setIsSubmitting(false)
            return
          }

          const slotsSaved = await setListingWeeklySlotsMutation.mutateAsync({
            p_listing_id: listingId,
            p_slots: weeklySlotsPayload,
          })

          if (!slotsSaved) {
            setFormError("Listing was created, but weekly hours could not be saved.")
            setIsSubmitting(false)
            return
          }

          setIsSubmitting(false)
          navigate(`/listing/${listingId}`)
        },
        onError: (error: any) => {
          setFormError(error?.message || "Failed to create listing.")
          setIsSubmitting(false)
        },
      }
    )
  }

  const removeImageAt = (index: number) => {
    setUploadedImages((prev) => {
      const next = [...prev]
      const [removed] = next.splice(index, 1)
      if (removed?.isObjectUrl) {
        URL.revokeObjectURL(removed.previewUrl)
      }
      return next
    })
  }

  const openCropper = (index: number) => {
    setCropImageIndex(index)
    setIsCropEditMode(false)
    setCropSelection(null)
    setCropStartPoint(null)
    setIsSelectingCrop(false)
  }

  const closeCropper = () => {
    setCropImageIndex(null)
    setIsCropEditMode(false)
    setCropSelection(null)
    setCropStartPoint(null)
    setIsSelectingCrop(false)
    setCropDrag(null)
  }

  const startCropMode = () => {
    setIsCropEditMode(true)
    setCropSelection({ x: 10, y: 10, width: 80, height: 80 })
  }

  const getCropPointFromMouse = (event: React.MouseEvent<HTMLDivElement>) => {
    const imageEl = cropImageRef.current
    if (!imageEl) return null

    const rect = imageEl.getBoundingClientRect()
    if (rect.width <= 0 || rect.height <= 0) return null

    const rawX = ((event.clientX - rect.left) / rect.width) * 100
    const rawY = ((event.clientY - rect.top) / rect.height) * 100

    return {
      x: Math.min(100, Math.max(0, rawX)),
      y: Math.min(100, Math.max(0, rawY)),
    }
  }

  const startCropSelection = (event: React.MouseEvent<HTMLDivElement>) => {
    if (!isCropEditMode) return

    const point = getCropPointFromMouse(event)
    if (!point) return

    setCropStartPoint(point)
    setIsSelectingCrop(true)
    setCropSelection({ x: point.x, y: point.y, width: 0, height: 0 })
  }

  const updateCropSelection = (event: React.MouseEvent<HTMLDivElement>) => {
    if (!isCropEditMode) return
    if (!isSelectingCrop || !cropStartPoint) return

    const point = getCropPointFromMouse(event)
    if (!point) return

    const x = Math.min(cropStartPoint.x, point.x)
    const y = Math.min(cropStartPoint.y, point.y)
    const width = Math.abs(point.x - cropStartPoint.x)
    const height = Math.abs(point.y - cropStartPoint.y)

    setCropSelection({ x, y, width, height })
  }

  const endCropSelection = () => {
    if (!isCropEditMode) return
    setIsSelectingCrop(false)
    setCropStartPoint(null)
  }

  const startCropDrag = (mode: CropDragMode, event: React.MouseEvent) => {
    if (!isCropEditMode) return
    if (!cropSelection) return

    event.preventDefault()
    event.stopPropagation()

    setCropDrag({
      mode,
      startX: event.clientX,
      startY: event.clientY,
      initial: cropSelection,
    })
  }

  useEffect(() => {
    if (!cropDrag) return

    const onMouseMove = (event: MouseEvent) => {
      const imageEl = cropImageRef.current
      if (!imageEl) return

      const rect = imageEl.getBoundingClientRect()
      if (rect.width <= 0 || rect.height <= 0) return

      const dx = ((event.clientX - cropDrag.startX) / rect.width) * 100
      const dy = ((event.clientY - cropDrag.startY) / rect.height) * 100

      const base = cropDrag.initial

      let x = base.x
      let y = base.y
      let width = base.width
      let height = base.height

      if (cropDrag.mode === "move") {
        x = clamp(base.x + dx, 0, 100 - base.width)
        y = clamp(base.y + dy, 0, 100 - base.height)
      } else {
        if (cropDrag.mode.includes("e")) {
          width = clamp(base.width + dx, MIN_CROP_SIZE, 100 - base.x)
        }

        if (cropDrag.mode.includes("s")) {
          height = clamp(base.height + dy, MIN_CROP_SIZE, 100 - base.y)
        }

        if (cropDrag.mode.includes("w")) {
          const nextX = clamp(base.x + dx, 0, base.x + base.width - MIN_CROP_SIZE)
          x = nextX
          width = base.width + (base.x - nextX)
        }

        if (cropDrag.mode.includes("n")) {
          const nextY = clamp(base.y + dy, 0, base.y + base.height - MIN_CROP_SIZE)
          y = nextY
          height = base.height + (base.y - nextY)
        }

        width = clamp(width, MIN_CROP_SIZE, 100 - x)
        height = clamp(height, MIN_CROP_SIZE, 100 - y)
      }

      setCropSelection({ x, y, width, height })
    }

    const onMouseUp = () => {
      setCropDrag(null)
    }

    window.addEventListener("mousemove", onMouseMove)
    window.addEventListener("mouseup", onMouseUp)

    return () => {
      window.removeEventListener("mousemove", onMouseMove)
      window.removeEventListener("mouseup", onMouseUp)
    }
  }, [cropDrag, isCropEditMode])

  const applyCrop = async () => {
    if (cropImageIndex === null) return

    const source = uploadedImages[cropImageIndex]
    if (!source) return

    setIsApplyingCrop(true)

    try {
      const result = await new Promise<UploadedImage>((resolve, reject) => {
        const image = new Image()

        image.onload = () => {
          if (!cropSelection || cropSelection.width < 1 || cropSelection.height < 1) {
            reject(new Error("No crop area selected"))
            return
          }

          const sx = (cropSelection.x / 100) * image.width
          const sy = (cropSelection.y / 100) * image.height
          const sw = (cropSelection.width / 100) * image.width
          const sh = (cropSelection.height / 100) * image.height

          const canvas = document.createElement("canvas")
          canvas.width = Math.max(1, Math.round(sw))
          canvas.height = Math.max(1, Math.round(sh))

          const context = canvas.getContext("2d")
          if (!context) {
            reject(new Error("Canvas not supported"))
            return
          }

          context.drawImage(
            image,
            sx,
            sy,
            sw,
            sh,
            0,
            0,
            canvas.width,
            canvas.height
          )

          canvas.toBlob(
            (blob) => {
              if (!blob) {
                reject(new Error("Could not create cropped image"))
                return
              }

              const originalName = (source.file?.name ?? "listing-image").replace(/\.[^/.]+$/, "")
              const croppedFile = new File([blob], `${originalName}-cropped.jpg`, { type: "image/jpeg" })
              resolve({
                file: croppedFile,
                previewUrl: URL.createObjectURL(croppedFile),
                isObjectUrl: true,
              })
            },
            "image/jpeg",
            0.92
          )
        }

        image.onerror = () => reject(new Error("Failed to load image"))
        image.src = source.previewUrl
      })

      setUploadedImages((prev) => {
        return prev.map((img, idx) => {
          if (idx !== cropImageIndex) return img
          if (img.isObjectUrl) {
            URL.revokeObjectURL(img.previewUrl)
          }
          return result
        })
      })
      setIsCropEditMode(false)
      setCropSelection(null)
      setCropStartPoint(null)
      setIsSelectingCrop(false)
      setCropDrag(null)
    } catch {
      setFormError("Could not crop the image. Please select an area and try again.")
    } finally {
      setIsApplyingCrop(false)
    }
  }

  if (!user) return null

  return (
    <main className="min-h-[calc(100vh-5.5rem)] bg-gradient-to-b from-[#f7f7f7] via-[#f3f3f3] to-[#ededed] px-4 py-8 md:px-8">
      <div className="mx-auto max-w-5xl">
        <Button asChild variant="outline" className="mb-4 rounded-full border-[#dadada] bg-[#ffffff] shadow-sm">
          <Link to="/">
            <ChevronLeft className="h-4 w-4" />
            Back
          </Link>
        </Button>

        <Card className="rounded-3xl border-[#e9e9e9] bg-[#ffffff] shadow-xl overflow-hidden">
          <CardHeader className="border-b border-[#ececec] bg-[#fcfcfc]">
            <div className="mb-3 inline-flex w-fit items-center gap-2 rounded-full border border-[#e2e2e2] bg-[#ffffff] px-3 py-1 text-xs text-[#4a4a4a]">
              <Sparkles className="h-3.5 w-3.5" />
              Host setup
            </div>
            <CardTitle className="text-3xl font-semibold text-[#000000]">{isEditMode ? "Edit your space" : "List your space"}</CardTitle>
            <CardDescription className="text-[#6a6a6a]">
              {isEditMode
                ? "Update your listing details and save changes."
                : "Fill all required fields to publish a complete listing page."}
            </CardDescription>
          </CardHeader>

          <CardContent className="space-y-6 pb-6 pt-6">
            <section className="rounded-2xl border border-[#ececec] bg-[#ffffff] p-4 md:p-5">
              <h3 className="mb-4 text-sm font-semibold uppercase tracking-wide text-[#6a6a6a]">Basics</h3>
              <div className="grid gap-4 md:grid-cols-2">
                <div className="space-y-1.5">
                  <p className="text-xs font-medium text-[#6a6a6a]">Title</p>
                  <Input placeholder="Listing title" value={form.title} onChange={(e) => setForm((prev) => ({ ...prev, title: e.target.value }))} />
                </div>
                <div className="space-y-1.5">
                  <p className="text-xs font-medium text-[#6a6a6a]">Subtitle / neighborhood</p>
                  <Input placeholder="e.g. Downtown, Toronto" value={form.subtitle} onChange={(e) => setForm((prev) => ({ ...prev, subtitle: e.target.value }))} />
                </div>
                <div className="space-y-1.5 md:col-span-2">
                  <p className="text-xs font-medium text-[#6a6a6a]">Address</p>
                  <div className="relative">
                    <Input
                      placeholder="Street address, e.g. 123 Main St"
                      value={form.address}
                      onFocus={() => setIsAddressDropdownOpen(true)}
                      onBlur={() => {
                        setTimeout(() => setIsAddressDropdownOpen(false), 120)
                      }}
                      onChange={(e) => {
                        setForm((prev) => ({ ...prev, address: e.target.value }))
                        setIsAddressDropdownOpen(true)
                      }}
                    />

                    {isAddressDropdownOpen && form.address.trim().length >= 3 && (
                      <div className="absolute top-full left-0 z-30 mt-2 w-full rounded-xl border border-[#e9e9e9] bg-[#ffffff] shadow-xl">
                        <div className="max-h-56 overflow-y-auto">
                          {isLoadingAddresses && (
                            <div className="px-4 py-3 text-sm text-[#6a6a6a]">Searching addresses...</div>
                          )}

                          {!isLoadingAddresses && addressError && (
                            <div className="px-4 py-3 text-sm text-[#6a6a6a]">{addressError}</div>
                          )}

                          {!isLoadingAddresses && !addressError && addressSuggestions.length === 0 && (
                            <div className="px-4 py-3 text-sm text-[#6a6a6a]">No addresses found</div>
                          )}

                          {!isLoadingAddresses && !addressError && addressSuggestions.map((address) => (
                            <button
                              key={address.id}
                              type="button"
                              onMouseDown={(e) => e.preventDefault()}
                              onClick={() => {
                                setForm((prev) => ({ ...prev, address: address.name }))
                                setIsAddressDropdownOpen(false)
                              }}
                              className="flex w-full items-center gap-3 px-4 py-3 text-left transition-colors hover:bg-[#e9e9e9]"
                            >
                              <div className="flex h-8 w-8 items-center justify-center rounded-lg bg-[#e9e9e9]">
                                <MapPin className="h-4 w-4 text-[#6a6a6a]" />
                              </div>
                              <span className="text-sm text-[#000000]">{address.name}</span>
                            </button>
                          ))}
                        </div>
                      </div>
                    )}
                  </div>
                  <p className="text-xs text-[#b48a00] mt-1">
                    This address will <b>not</b> be visible to users unless they book your place. The location shown on the map will be slightly offset for privacy.
                  </p>
                </div>
                <div className="space-y-1.5">
                  <p className="text-xs font-medium text-[#6a6a6a]">Category</p>
                  <select
                    value={form.category}
                    onChange={(e) => setForm((prev) => ({ ...prev, category: e.target.value }))}
                    className="flex h-10 w-full rounded-xl border border-input bg-background px-3 py-2 text-sm outline-none transition-colors focus-visible:border-ring focus-visible:ring-3 focus-visible:ring-ring/50"
                  >
                    <option value="REHEARSAL_SPACE">Rehearsal space</option>
                    <option value="RECORDING_STUDIO">Recording studio</option>
                    <option value="OTHER">Other</option>
                  </select>
                </div>
                {/* Address autocomplete is used instead of a city field */}

                <div className="space-y-1.5 md:col-span-2">
                  <p className="text-xs font-medium text-[#6a6a6a]">Hourly rate (CAD)</p>
                  <Input type="number" min="1" step="1" placeholder="e.g. 40" value={form.hourlyRate} onChange={(e) => setForm((prev) => ({ ...prev, hourlyRate: e.target.value }))} />
                </div>

                <div className="space-y-1.5 md:col-span-2">
                  <p className="text-xs font-medium text-[#6a6a6a]">Studio area (m²)</p>
                  <Input type="number" min="1" step="0.1" placeholder="e.g. 35" value={form.areaM2} onChange={(e) => setForm((prev) => ({ ...prev, areaM2: e.target.value }))} />
                </div>
              </div>
            </section>

            <section className="rounded-2xl border border-[#ececec] bg-[#ffffff] p-4 md:p-5">
              <div className="mb-3 flex items-center justify-between">
                <h3 className="text-sm font-semibold uppercase tracking-wide text-[#6a6a6a]">Photos</h3>
                <span className="rounded-full bg-[#f1f1f1] px-2.5 py-1 text-xs font-medium text-[#4a4a4a]">
                  {uploadedImages.length}/5
                </span>
              </div>

              <label
                className={`flex cursor-pointer items-center justify-center gap-2 rounded-xl border border-dashed px-4 py-5 text-sm transition-colors ${
                  uploadedImages.length >= 5
                    ? "cursor-not-allowed border-[#e2e2e2] bg-[#f5f5f5] text-[#9a9a9a]"
                    : "border-[#d5d5d5] bg-[#fafafa] text-[#4a4a4a] hover:border-[#000000] hover:bg-[#f7f7f7]"
                }`}
              >
                <UploadCloud className="h-4 w-4" />
                {uploadedImages.length >= 5 ? "Max photos reached" : "Upload photos from your computer"}
                <input
                  type="file"
                  accept="image/*"
                  multiple
                  disabled={uploadedImages.length >= 5}
                  onChange={(e) => void handleImageUpload(e)}
                  className="hidden"
                />
              </label>

              {uploadedImages.length > 0 && (
                <div className="mt-3 grid grid-cols-2 gap-3 sm:grid-cols-3 md:grid-cols-5">
                  {uploadedImages.map((image, idx) => (
                    <div key={`${idx}-${image.file?.name ?? image.persistedUrl ?? "image"}-${image.file?.lastModified ?? 0}`} className="group relative overflow-hidden rounded-xl border border-[#ececec] bg-[#ffffff]">
                      <button
                        type="button"
                        onClick={() => openCropper(idx)}
                        className="block w-full"
                        aria-label={`Crop image ${idx + 1}`}
                      >
                        <img
                          src={image.previewUrl}
                          alt={`Uploaded preview ${idx + 1}`}
                          className="h-24 w-full object-cover"
                        />
                      </button>
                      <button
                        type="button"
                        onClick={() => removeImageAt(idx)}
                        className="absolute right-1.5 top-1.5 rounded-full bg-[#000000]/75 p-1 text-[#ffffff] opacity-0 transition-opacity hover:bg-[#000000] group-hover:opacity-100"
                        aria-label={`Remove image ${idx + 1}`}
                      >
                        <X className="h-3 w-3" />
                      </button>
                    </div>
                  ))}
                </div>
              )}
              {uploadedImages.length > 0 && (
                <p className="mt-2 text-xs text-[#6a6a6a]">Tip: click any photo to crop it.</p>
              )}
            </section>

            <section className="rounded-2xl border border-[#ececec] bg-[#ffffff] p-4 md:p-5">
              <h3 className="mb-3 text-sm font-semibold uppercase tracking-wide text-[#6a6a6a]">Details</h3>
              <div className="space-y-4">
                <div className="space-y-1.5">
                  <p className="text-xs font-medium text-[#6a6a6a]">About this space</p>
                  <Textarea
                    value={form.description}
                    onChange={(e) => setForm((prev) => ({ ...prev, description: e.target.value }))}
                    placeholder="Describe the space, setup, and what it is ideal for..."
                    className="min-h-28"
                  />
                </div>

                <div className="space-y-1.5">
                  <p className="text-xs font-medium text-[#6a6a6a]">Equipment Description</p>
                  <Textarea
                    value={form.equipmentDesc}
                    onChange={(e) => setForm((prev) => ({ ...prev, equipmentDesc: e.target.value }))}
                    placeholder={"Drum kit, microphones, monitors, mixer..."}
                    className="min-h-24"
                  />
                </div>

                <div className="space-y-1.5">
                  <p className="text-xs font-medium text-[#6a6a6a]">Space conveniences</p>
                  <Textarea
                    value={form.conveniencesDesc}
                    onChange={(e) => setForm((prev) => ({ ...prev, conveniencesDesc: e.target.value }))}
                    placeholder={"Bathroom, A/C, Wi-Fi, parking..."}
                    className="min-h-24"
                  />
                </div>
              </div>
            </section>

            <section className="rounded-2xl border border-[#ececec] bg-[#ffffff] p-4 md:p-5">
              <div className="mb-3 flex flex-wrap items-center justify-between gap-3">
                <h3 className="text-sm font-semibold uppercase tracking-wide text-[#6a6a6a]">Weekly hours & pricing</h3>
                <div className="flex flex-wrap items-center gap-2">
                  <Input
                    type="number"
                    min="0"
                    step="1"
                    placeholder="Set all"
                    value={bulkWeekPrice}
                    onChange={(e) => setBulkWeekPrice(e.target.value)}
                    className="h-9 w-28"
                  />
                  <Button
                    type="button"
                    variant="outline"
                    className="h-9"
                    onClick={() => {
                      const value = bulkWeekPrice.trim()
                      if (!value) return
                      setWeeklySlotPrices(Array.from({ length: SLOT_COUNT }, () => value))
                    }}
                  >
                    Apply all
                  </Button>
                  <Button
                    type="button"
                    variant="outline"
                    className="h-9"
                    onClick={() => setWeeklySlotPrices(Array.from({ length: SLOT_COUNT }, () => ""))}
                  >
                    Clear all
                  </Button>
                </div>
              </div>

              <p className="mb-3 text-xs text-[#6a6a6a]">
                Enter a price for working hours. Leave empty to mark that hour as closed.
              </p>

              <div className="overflow-auto rounded-xl border border-[#e9e9e9]">
                <table className="min-w-[780px] w-full border-collapse text-xs">
                  <thead>
                    <tr className="bg-[#fafafa]">
                      <th className="sticky left-0 z-10 border-b border-r border-[#ececec] bg-[#fafafa] px-2 py-2 text-left font-medium text-[#6a6a6a]">Hour</th>
                      {WEEK_DAYS.map((dayLabel, weekday) => (
                        <th key={`day-header-${dayLabel}`} className="border-b border-r border-[#ececec] px-2 py-2 text-center font-medium text-[#6a6a6a]">
                          <div className="flex items-center justify-center gap-1.5">
                            <span>{dayLabel}</span>
                            <button
                              type="button"
                              onClick={() => {
                                setWeeklySlotPrices((prev) => {
                                  const next = [...prev]
                                  for (let hour = 0; hour < HOURS.length; hour += 1) {
                                    next[weekday * 24 + hour] = ""
                                  }
                                  return next
                                })
                              }}
                              className="inline-flex h-5 w-5 items-center justify-center rounded-full border border-[#dadada] text-[#7a7a7a] hover:border-[#000000] hover:text-[#000000]"
                              aria-label={`Clear all hours for ${dayLabel}`}
                              title={`Clear all hours for ${dayLabel}`}
                            >
                              <X className="h-3 w-3" />
                            </button>
                          </div>
                        </th>
                      ))}
                    </tr>
                  </thead>
                  <tbody>
                    {HOURS.map((hour) => (
                      <tr key={`hour-row-${hour}`}>
                        <td className="sticky left-0 z-10 border-b border-r border-[#ececec] bg-[#ffffff] px-2 py-2 font-medium text-[#000000]">
                          <div className="flex items-center gap-2">
                            <button
                              type="button"
                              onClick={() => {
                                setWeeklySlotPrices((prev) => {
                                  const next = [...prev]
                                  for (let weekday = 0; weekday < WEEK_DAYS.length; weekday += 1) {
                                    next[weekday * 24 + hour] = ""
                                  }
                                  return next
                                })
                              }}
                              className="inline-flex h-5 w-5 items-center justify-center rounded-full border border-[#dadada] text-[#7a7a7a] hover:border-[#000000] hover:text-[#000000]"
                              aria-label={`Clear ${hour.toString().padStart(2, "0")}:00 for all days`}
                              title="Clear this hour for all days"
                            >
                              <X className="h-3 w-3" />
                            </button>
                            <span>{hour.toString().padStart(2, "0")}:00</span>
                          </div>
                        </td>
                        {WEEK_DAYS.map((dayLabel, weekday) => {
                          const index = weekday * 24 + hour
                          return (
                            <td key={`${hour}-${dayLabel}`} className="border-b border-r border-[#f1f1f1] p-1">
                              <Input
                                type="number"
                                min="0"
                                step="1"
                                placeholder="—"
                                value={weeklySlotPrices[index] ?? ""}
                                onChange={(e) => {
                                  const value = e.target.value
                                  setWeeklySlotPrices((prev) => {
                                    const next = [...prev]
                                    next[index] = value
                                    return next
                                  })
                                }}
                                className="h-8 min-w-[72px] border-[#e6e6e6] px-2 text-center"
                              />
                            </td>
                          )
                        })}
                      </tr>
                    ))}
                  </tbody>
                </table>
              </div>
            </section>

            {formError ? (
              <div className="rounded-xl border border-[#f1c3bd] bg-[#fff3f2] px-4 py-3 text-sm text-[#b42318]">
                {formError}
              </div>
            ) : null}

            <div className="flex justify-end border-t border-[#ececec] pt-4">
              <Button
                type="button"
                onClick={submit}
                disabled={isSubmitting}
                className="h-11 rounded-xl bg-[#000000] px-7 text-[#ffffff] shadow-sm hover:bg-[#1a1a1a]"
              >
                {isSubmitting ? (isEditMode ? "Updating..." : "Creating...") : (isEditMode ? "Update listing" : "Create listing")}
              </Button>
            </div>
          </CardContent>
        </Card>
      </div>

      {cropImageIndex !== null && uploadedImages[cropImageIndex] && (
        <div className="fixed inset-0 z-[140] flex items-center justify-center p-3 md:p-5">
          <button
            type="button"
            className="absolute inset-0 bg-[#000000]/70 backdrop-blur-[2px]"
            onClick={closeCropper}
            aria-label="Close crop modal"
          />

          <div className="relative z-10 max-h-[calc(100vh-1.5rem)] w-full max-w-3xl overflow-y-auto rounded-3xl border border-[#e9e9e9] bg-[#ffffff] shadow-2xl md:max-h-[calc(100vh-2.5rem)]">
            <div className="flex items-center justify-between border-b border-[#ececec] bg-gradient-to-r from-[#fafafa] to-[#f3f3f3] px-4 py-3 md:px-5">
              <div>
                <h3 className="text-base font-semibold text-[#000000] md:text-lg">Photo editor</h3>
                <p className="text-xs text-[#6a6a6a]">
                  {isCropEditMode ? "Crop mode" : "View mode"}
                </p>
              </div>
              <Button type="button" variant="ghost" size="icon" onClick={closeCropper} className="h-8 w-8 rounded-full hover:bg-[#e9e9e9]">
                <X className="h-4 w-4" />
              </Button>
            </div>

            <div className="p-4 md:p-5">
            <div className="overflow-hidden rounded-2xl border border-[#e9e9e9] bg-[#f7f7f7]">
              <div
                className="relative mx-auto w-fit max-w-full cursor-crosshair"
                onMouseDown={startCropSelection}
                onMouseMove={updateCropSelection}
                onMouseUp={endCropSelection}
                onMouseLeave={endCropSelection}
              >
                <img
                  ref={cropImageRef}
                  src={uploadedImages[cropImageIndex]?.previewUrl}
                  alt="Crop preview"
                  className="block max-h-[72vh] w-auto max-w-full select-none"
                  draggable={false}
                />

                {isCropEditMode && cropSelection && (
                  <div
                    className="absolute border-2 border-[#ffffff] bg-[#ffffff]/20 shadow-[0_0_0_9999px_rgba(0,0,0,0.45)]"
                    style={{
                      left: `${cropSelection.x}%`,
                      top: `${cropSelection.y}%`,
                      width: `${cropSelection.width}%`,
                      height: `${cropSelection.height}%`,
                    }}
                    onMouseDown={(event) => startCropDrag("move", event)}
                  />
                )}

                {isCropEditMode && cropSelection && (
                  <>
                    <div
                      className="absolute h-3 w-3 -translate-x-1/2 -translate-y-1/2 cursor-nwse-resize rounded-full border border-[#ffffff] bg-[#000000]"
                      style={{ left: `${cropSelection.x}%`, top: `${cropSelection.y}%` }}
                      onMouseDown={(event) => startCropDrag("nw", event)}
                    />
                    <div
                      className="absolute h-3 w-3 -translate-x-1/2 -translate-y-1/2 cursor-nesw-resize rounded-full border border-[#ffffff] bg-[#000000]"
                      style={{ left: `${cropSelection.x + cropSelection.width}%`, top: `${cropSelection.y}%` }}
                      onMouseDown={(event) => startCropDrag("ne", event)}
                    />
                    <div
                      className="absolute h-3 w-3 -translate-x-1/2 -translate-y-1/2 cursor-nesw-resize rounded-full border border-[#ffffff] bg-[#000000]"
                      style={{ left: `${cropSelection.x}%`, top: `${cropSelection.y + cropSelection.height}%` }}
                      onMouseDown={(event) => startCropDrag("sw", event)}
                    />
                    <div
                      className="absolute h-3 w-3 -translate-x-1/2 -translate-y-1/2 cursor-nwse-resize rounded-full border border-[#ffffff] bg-[#000000]"
                      style={{ left: `${cropSelection.x + cropSelection.width}%`, top: `${cropSelection.y + cropSelection.height}%` }}
                      onMouseDown={(event) => startCropDrag("se", event)}
                    />

                    <div
                      className="absolute h-3 w-8 -translate-x-1/2 -translate-y-1/2 cursor-n-resize"
                      style={{ left: `${cropSelection.x + cropSelection.width / 2}%`, top: `${cropSelection.y}%` }}
                      onMouseDown={(event) => startCropDrag("n", event)}
                    />
                    <div
                      className="absolute h-3 w-8 -translate-x-1/2 -translate-y-1/2 cursor-s-resize"
                      style={{ left: `${cropSelection.x + cropSelection.width / 2}%`, top: `${cropSelection.y + cropSelection.height}%` }}
                      onMouseDown={(event) => startCropDrag("s", event)}
                    />
                    <div
                      className="absolute h-8 w-3 -translate-x-1/2 -translate-y-1/2 cursor-w-resize"
                      style={{ left: `${cropSelection.x}%`, top: `${cropSelection.y + cropSelection.height / 2}%` }}
                      onMouseDown={(event) => startCropDrag("w", event)}
                    />
                    <div
                      className="absolute h-8 w-3 -translate-x-1/2 -translate-y-1/2 cursor-e-resize"
                      style={{ left: `${cropSelection.x + cropSelection.width}%`, top: `${cropSelection.y + cropSelection.height / 2}%` }}
                      onMouseDown={(event) => startCropDrag("e", event)}
                    />
                  </>
                )}
              </div>
            </div>

            <div className="mt-3 flex items-start justify-between gap-3">
            <p className="text-xs text-[#6a6a6a] md:text-sm">
              {isCropEditMode
                ? "Drag on the image to select the area you want to crop."
                : "Viewing mode. Click the crop icon to start selecting an area."}
            </p>
            <span className={`shrink-0 rounded-full px-2.5 py-1 text-[0.6875rem] font-medium ${
              isCropEditMode ? "bg-[#eaf8ef] text-[#0f6130]" : "bg-[#f2f2f2] text-[#5a5a5a]"
            }`}>
              {isCropEditMode ? "Editing" : "Viewing"}
            </span>
            </div>

            <div className="mt-5 flex flex-wrap items-center justify-between gap-2 border-t border-[#ececec] pt-4">
              <div className="flex items-center gap-2">
                {!isCropEditMode ? (
                  <Button
                    type="button"
                    variant="outline"
                    onClick={startCropMode}
                    className="rounded-xl border-[#dadada] bg-[#ffffff]"
                    aria-label="Crop photo"
                    title="Crop photo"
                  >
                    <Crop className="h-4 w-4" />
                  </Button>
                ) : null}
              </div>

              <div className="flex items-center gap-2">
                <Button type="button" variant="outline" onClick={closeCropper} className="rounded-xl border-[#dadada] bg-[#ffffff]">
                  Close
                </Button>
                {isCropEditMode && (
                  <Button
                    type="button"
                    onClick={() => void applyCrop()}
                    disabled={isApplyingCrop}
                    className="rounded-xl bg-[#000000] px-5 text-[#ffffff] hover:bg-[#1a1a1a]"
                  >
                    {isApplyingCrop ? "Applying..." : "Apply crop"}
                  </Button>
                )}
              </div>
            </div>
            </div>
          </div>
        </div>
      )}
    </main>
  )
}
