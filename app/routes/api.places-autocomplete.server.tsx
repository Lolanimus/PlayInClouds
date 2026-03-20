import type { LoaderFunction } from "react-router";

export const loader: LoaderFunction = async ({ request }) => {
  // Only allow GET requests
  if (request.method !== "GET") {
    return new Response(JSON.stringify({ error: "Method not allowed" }), {
      status: 405,
      headers: { "Content-Type": "application/json" },
    });
  }

  const url = new URL(request.url);
  const input = url.searchParams.get("input");

  if (!input || input.length < 2) {
    return new Response(JSON.stringify({ predictions: [] }), {
      headers: { "Content-Type": "application/json" },
    });
  }

  const apiKey = process.env.VITE_PUBLIC_GOOGLE_MAPS_API_KEY;
  if (!apiKey) {
    return new Response(JSON.stringify({ error: "API key not configured" }), {
      status: 500,
      headers: { "Content-Type": "application/json" },
    });
  }

  try {
    const response = await fetch(
      `https://maps.googleapis.com/maps/api/place/autocomplete/json?input=${encodeURIComponent(input)}&key=${apiKey}&components=country:*`
    );

    if (!response.ok) {
      throw new Error(`Google API responded with ${response.status}`);
    }

    const data = await response.json();

    // Return only the first 6 predictions
    const predictions = (data.predictions || [])
      .slice(0, 6)
      .map((prediction: { main_text: string; place_id: string }) => ({
        name: prediction.main_text,
        id: prediction.place_id,
      }));

    return new Response(JSON.stringify({ predictions }), {
      headers: { "Content-Type": "application/json" },
    });
  } catch (error) {
    console.error("Error fetching from Google Places API:", error);
    return new Response(
      JSON.stringify({ error: "Failed to fetch suggestions", predictions: [] }),
      {
        status: 500,
        headers: { "Content-Type": "application/json" },
      }
    );
  }
};
