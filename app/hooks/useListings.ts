import * as listingEvents from "@/db_rpc/listings_rpc";
import { uploadFile, getPublicUrl } from "@/api/blob";
import { queries } from "@/queries/queries";
import supabase from "@/utils/supabase";
import {
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
}) => {
  const query = useQuery({
    ...queries.listings.list(opts),
    enabled: true,
  });

  return query;
};

export const useInfiniteListings = (
  opts?: { p_address?: string; p_category?: any; p_min_price?: number; p_max_price?: number; p_limit?: number },
  initialPageParam = 0
) => {
  const query = useInfiniteQuery({
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

  return query;
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
      p_amenities: string[];
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
        payload.p_amenities
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
      return await listingEvents.updateListing(args);
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
      return await listingEvents.deleteListing(p_id);
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