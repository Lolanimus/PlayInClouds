export default function Header() {
    return (
        <header className="w-full h-1/5 bg-black flex items-center gap-5">
            <div className="flex-2 bg-gray-500 size-full">
                <img 
                    src="https://storage.googleapis.com/airdrums_public/logo/AirDrums_Logo.svg" 
                    className="size-full"
                />
            </div>
            <div className="flex-6 flex items-center bg-gray-500 size-full gap-2 h-25 rounded-full">
                <div className="flex flex-1 flex-col justify-center p-10 rounded-full bg-gray-400 h-full">
                    <p className="font-bold">Where</p>
                    <p>Search destination</p>
                </div>
                <div className="w-0.5 h-1/2 bg-gray-400"></div>
                <div className="flex flex-1 flex-col justify-center p-10 rounded-full bg-gray-400 h-full">
                    <p className="font-bold">When</p>
                    <p>Add dates</p>
                </div>
                <div className="w-0.5 h-1/2 bg-gray-400"></div>
                <div className="flex flex-1 flex-col justify-center p-10 rounded-full bg-gray-400 h-full">
                    <p className="font-bold">Who</p>
                    <p>Add guests</p>
                </div>
            </div>
           <div className="flex-2 bg-gray-500 size-full">

            </div>
        </header>
    )
}