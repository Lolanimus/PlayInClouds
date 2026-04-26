import * as listingEvents from "~/api/backend/listings";
import { deleteFile, uploadFile, getPublicUrl } from "~/api/supabase/blob";
import { queries } from "@/queries/queries";
import type { Listing, ListingModerationQueueItem } from "@/types/custom/api.types";
import supabase from "@/utils/supabase";
import {
  type UseQueryResult,
  useInfiniteQuery,
  useMutation,
  useQuery,
  useQueryClient,
} from "@tanstack/react-query";

export const useListings = (opts?: {
  p_address?: string;
  p_category?: any;
  p_min_price?: number;
  p_max_price?: number;
  p_limit?: number;
  p_offset?: number;
}): UseQueryResult<Listing[] | null, Error> => {
  const query = useQuery({
    ...queries.listings.list(opts),
    enabled: true,
  });

  return query as UseQueryResult<Listing[] | null, Error>;
};

const extractStorageObjectName = (value: string, bucket = "images"): string | null => {
  if (!value?.trim()) return null;

  const trimmed = value.trim();
  if (!trimmed.startsWith("http://") && !trimmed.startsWith("https://")) {
    return trimmed;
  }

  const patterns = [
    `/storage/v1/object/public/${bucket}/`,
    `/object/public/${bucket}/`,
    `/storage/v1/object/sign/${bucket}/`,
    `/object/sign/${bucket}/`,
  ];

  for (const pattern of patterns) {
    const idx = trimmed.indexOf(pattern);
    if (idx >= 0) {
      const objectWithQuery = trimmed.slice(idx + pattern.length);
      const objectName = objectWithQuery.split("?")[0]?.split("#")[0] ?? "";
      return objectName || null;
    }
  }

  return null;
};

const cleanupStorageImages = async (images: string[]) => {
  const objectNames = Array.from(
    new Set(images.map((img) => extractStorageObjectName(img)).filter((v): v is string => Boolean(v)))
  );

  await Promise.all(objectNames.map((name) => deleteFile("images", name)));
};

export const useInfiniteListings = (
  opts?: { p_address?: string; p_category?: any; p_min_price?: number; p_max_price?: number; p_limit?: number },
  initialPageParam = 0
) => {
  const query = useInfiniteQuery<Listing[] | null>({
    ...queries.listings.infiniteListings(opts),
    initialPageParam,
    getNextPageParam: (_lastPage, pages) => {
      const limit = opts?.p_limit ?? 50;
      return pages.length * limit;
    },
    enabled: true,
  });

  return query;
};

export const useGetListing = (id?: string) => {
  const query = useQuery({
    ...queries.listings.detailById(id),
    enabled: !!id,
  });

  return query as UseQueryResult<Listing | null, Error>;
};

export const useOwnListings = (
  config?: { enabled?: boolean }
): UseQueryResult<Listing[] | null, Error> => {
  const query = useQuery({
    ...queries.listings.own(),
    enabled: config?.enabled ?? true,
  });

  return query as UseQueryResult<Listing[] | null, Error>;
};

export const usePendingListings = (
  config?: { enabled?: boolean }
): UseQueryResult<ListingModerationQueueItem[] | null, Error> => {
  const query = useQuery({
    ...queries.listings.pending(),
    enabled: config?.enabled ?? true,
  });

  return query as UseQueryResult<ListingModerationQueueItem[] | null, Error>;
};

export const useCurrentUserIsAdmin = (
  config?: { enabled?: boolean }
): UseQueryResult<boolean | null, Error> => {
  const query = useQuery({
    ...queries.listings.adminStatus(),
    enabled: config?.enabled ?? true,
  });

  return query as UseQueryResult<boolean | null, Error>;
};

export const useCreateListing = () => {
  const queryClient = useQueryClient();

  return useMutation({
    mutationFn: async (payload: {
      p_lat: number;
      p_lng: number;
      p_address: string;
      p_title: string;
      p_subtitle: string;
      p_category: any;
      p_price: number;
      p_images: (string | File)[];
      p_description: string;
      p_equipment_desc: string;
      p_conveniences_desc: string;
      p_area_m2: number;
      p_cancellation_policy_hours?: number | null;
      p_advance_notice_hours?: number | null;
      p_timezone?: string;
      p_host_confirmation_message?: string;
      p_rules?: string;
      p_instructions?: string;
    }) => {
      console.info("Creating listing", payload);

      const {
        data: { user },
      } = await supabase.auth.getUser();

      if (!user?.id) {
        throw new Error("You must be logged in to upload listing images.");
      }

      // Upload images if any are File objects
      const uploadedImageUrls: string[] = [];
      for (const img of payload.p_images) {
        if (typeof img === "string") {
          uploadedImageUrls.push(img);
        } else if (img instanceof File) {
          const safeName = img.name.replace(/[^a-zA-Z0-9._-]/g, "_");
          const path = `listings/${user.id}/${Date.now()}_${safeName}`;
          const uploadedPath = await uploadFile("images", path, img);
          if (uploadedPath) {
            const url = getPublicUrl("images", uploadedPath);
            uploadedImageUrls.push(url);
          }
        }
      }
      return await listingEvents.createListing(
        payload.p_lat,
        payload.p_lng,
        payload.p_address,
        payload.p_title,
        payload.p_subtitle,
        payload.p_category,
        payload.p_price,
        uploadedImageUrls,
        payload.p_description,
        payload.p_equipment_desc,
        payload.p_conveniences_desc,
        payload.p_area_m2,
        payload.p_cancellation_policy_hours,
        payload.p_advance_notice_hours,
        payload.p_timezone,
        payload.p_host_confirmation_message,
        payload.p_rules,
        payload.p_instructions
      );
    },
    onSuccess: () => {
      console.info("Listing created, invalidating listings queries");
      queryClient.invalidateQueries({ queryKey: queries.listings._def });
    },
    onError: (err: any) => {
      console.error("Error creating listing", err);
    },
  });
};

export const useUpdateListing = () => {
  const queryClient = useQueryClient();

  return useMutation({
    mutationFn: async (args: any) => {
      console.info("Updating listing", args);

      const previousListing = await listingEvents.getListing(args.p_id as string);
      const previousImages = ((previousListing as any)?.images ?? []) as string[];

      const {
        data: { user },
      } = await supabase.auth.getUser();

      if (!user?.id) {
        throw new Error("You must be logged in to upload listing images.");
      }

      // Upload new images if any are File objects
      let images = args.p_images;
      if (Array.isArray(images)) {
        const uploadedImageUrls: string[] = [];
        for (const img of images) {
          if (typeof img === "string") {
            uploadedImageUrls.push(img);
          } else if (img instanceof File) {
            const safeName = img.name.replace(/[^a-zA-Z0-9._-]/g, "_");
            const path = `listings/${user.id}/${Date.now()}_${safeName}`;
            const uploadedPath = await uploadFile("images", path, img);
            if (uploadedPath) {
              const url = getPublicUrl("images", uploadedPath);
              uploadedImageUrls.push(url);
            }
          }
        }
        args.p_images = uploadedImageUrls;
      }

      const nextImages = (args.p_images ?? []) as string[];
      const removedImages = previousImages.filter((img) => !nextImages.includes(img));

      const updated = await listingEvents.updateListing(args);

      if (updated && removedImages.length > 0) {
        await cleanupStorageImages(removedImages);
      }

      return updated;
    },
    onSuccess: () => {
      console.info("Listing updated, invalidating listings queries");
      queryClient.invalidateQueries({ queryKey: queries.listings._def });
    },
    onError: (err: any) => {
      console.error("Error updating listing", err);
    },
  });
};

export const useDeleteListing = () => {
  const queryClient = useQueryClient();

  return useMutation({
    mutationFn: async (p_id: string) => {
      console.info("Deleting listing", p_id);

      const listing = await listingEvents.getListing(p_id);
      const listingImages = ((listing as any)?.images ?? []) as string[];

      const deleted = await listingEvents.deleteListing(p_id);

      if (deleted && listingImages.length > 0) {
        await cleanupStorageImages(listingImages);
      }

      return deleted;
    },
    onSuccess: () => {
      console.info("Listing deleted, invalidating listings queries");
      queryClient.invalidateQueries({ queryKey: queries.listings._def });
    },
    onError: (err: any) => {
      console.error("Error deleting listing", err);
    },
  });
};

export const useApproveListing = () => {
  const queryClient = useQueryClient();

  return useMutation({
    mutationFn: async (payload: { p_listing_id: string; p_message?: string | null }) => {
      return await listingEvents.approveListing(payload.p_listing_id, payload.p_message);
    },
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: queries.listings._def });
    },
    onError: (err: any) => {
      console.error("Error approving listing", err);
    },
  });
};

export const useRejectListing = () => {
  const queryClient = useQueryClient();

  return useMutation({
    mutationFn: async (payload: { p_listing_id: string; p_message?: string | null }) => {
      return await listingEvents.rejectListing(payload.p_listing_id, payload.p_message);
    },
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: queries.listings._def });
    },
    onError: (err: any) => {
      console.error("Error rejecting listing", err);
    },
  });
};