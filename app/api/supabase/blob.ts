
import supabase from "@/utils/supabase";
import { processBlobRequest } from "./helpers";


// Upload a file to a bucket
const uploadFile = async (
	bucket: string,
	path: string,
	file: File | Blob
): Promise<string | null> => {
	return await processBlobRequest(async () => {
		const { data, error } = await supabase.storage.from(bucket).upload(path, file, {
			cacheControl: "3600",
			upsert: false,
		});
		if (error) throw error;
		console.info("File uploaded to", data?.path);
		return data?.path ?? null;
	});
};

// Download a file from a bucket
const downloadFile = async (
	bucket: string,
	path: string
): Promise<Blob | null> => {
	return await processBlobRequest(async () => {
		const { data, error } = await supabase.storage.from(bucket).download(path);
		if (error) throw error;
		console.info("File downloaded from", path);
		return data;
	});
};

// Get a public URL for a file
const getPublicUrl = (bucket: string, path: string): string => {
	const { data } = supabase.storage.from(bucket).getPublicUrl(path);
	console.info("Public URL generated for", path);
	return data.publicUrl;
};

// Delete a file from a bucket
const deleteFile = async (
	bucket: string,
	path: string
): Promise<boolean> => {
	const result = await processBlobRequest(async () => {
		const { error } = await supabase.storage.from(bucket).remove([path]);
		if (error) throw error;
		console.info("File deleted from", path);
		return true;
	});
	return !!result;
};

export { uploadFile, downloadFile, getPublicUrl, deleteFile };
